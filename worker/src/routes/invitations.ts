import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { createSecretToken, sha256Bytea } from "../crypto/tokens"
import { HttpError } from "../http-error"
import { requireUser } from "../middleware/auth"
import { createAdminClient, createUserClient } from "../supabase"
import { parseId, parseJson } from "../validation"

const invitationSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
})

export const invitationManagement = new Hono<AppEnvironment>()
invitationManagement.use("*", requireUser)

invitationManagement.post("/:planId/invitations", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const { email } = await parseJson(context.req.raw, invitationSchema)
  const token = createSecretToken()
  const tokenHash = await sha256Bytea(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data, error } = await client.from("invitations").insert({
    plan_id: planId,
    invited_by: context.get("user").id,
    email,
    token_hash: tokenHash,
    expires_at: expiresAt,
  }).select("id,email,status,expires_at").single()
  if (error?.code === "23505") throw new HttpError(409, "conflict", "This person already has a pending invitation")
  if (error) throw new HttpError(403, "forbidden", "Only the host can invite people")

  const inviteUrl = new URL(`/invite/${token}`, context.env.FRONTEND_URL).toString()
  return context.json({ invitation: data, inviteUrl }, 201)
})

export const invitationAccess = new Hono<AppEnvironment>()

invitationAccess.get("/:token", async (context) => {
  const tokenHash = await sha256Bytea(context.req.param("token"))
  const admin = createAdminClient(context.env)
  const { data: invitation } = await admin
    .from("invitations")
    .select("plan_id,status,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()
  if (!invitation || invitation.status !== "pending" || Date.parse(invitation.expires_at) <= Date.now()) {
    throw new HttpError(404, "not_found", "Invitation is invalid or expired")
  }
  const { data: plan } = await admin
    .from("plans")
    .select("id,name,start_date,end_date,duration_minutes,time_zone")
    .eq("id", invitation.plan_id)
    .single()
  if (!plan) throw new HttpError(404, "not_found", "Plan not found")
  return context.json({ plan })
})

invitationAccess.post("/:token/accept", requireUser, async (context) => {
  const tokenHash = await sha256Bytea(context.req.param("token"))
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data, error } = await client.rpc("accept_plan_invitation", { invitation_token_hash: tokenHash })
  if (error || !Array.isArray(data) || !data[0]) {
    throw new HttpError(500, "internal_error", "Invitation could not be accepted")
  }
  const result = data[0] as { outcome: string; accepted_plan_id: string | null }
  if (result.outcome === "email_mismatch") throw new HttpError(403, "forbidden", "Invitation belongs to another email")
  if (result.outcome !== "accepted" || !result.accepted_plan_id) {
    throw new HttpError(409, "conflict", "Invitation is invalid or expired")
  }
  return context.json({ planId: result.accepted_plan_id })
})
