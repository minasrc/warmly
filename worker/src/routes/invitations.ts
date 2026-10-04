import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { createSecretToken, sha256Bytea } from "../crypto/tokens"
import { HttpError } from "../http-error"
import { requireUser } from "../middleware/auth"
import { createAdminClient, createUserClient } from "../supabase"
import { parseId, parseJson } from "../validation"
import { writeAuditEvent } from "../audit"

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

  await writeAuditEvent(context.env, {
    action: "invitation.created",
    actorId: context.get("user").id,
    requestId: context.get("requestId"),
    planId,
    metadata: { invitationId: data.id },
  })
  const inviteUrl = new URL(`/invite/${token}`, context.env.FRONTEND_URL).toString()
  return context.json({ invitation: data, inviteUrl }, 201)
})

invitationManagement.delete("/:planId/invitations/:invitationId", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const invitationId = parseId(context.req.param("invitationId"))
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data, error } = await client
    .from("invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("plan_id", planId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()
  if (error) throw new HttpError(403, "forbidden", "Only the host can cancel invitations")
  if (!data) throw new HttpError(404, "not_found", "Pending invitation not found")
  await writeAuditEvent(context.env, {
    action: "invitation.revoked",
    actorId: context.get("user").id,
    requestId: context.get("requestId"),
    planId,
    metadata: { invitationId },
  })
  return context.body(null, 204)
})

invitationManagement.delete("/:planId/members/:memberId", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const memberId = parseId(context.req.param("memberId"))
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data: plan } = await client.from("plans").select("host_id").eq("id", planId).maybeSingle()
  if (!plan || plan.host_id !== context.get("user").id) {
    throw new HttpError(403, "forbidden", "Only the host can remove participants")
  }
  if (memberId === plan.host_id) throw new HttpError(409, "conflict", "The host cannot be removed")
  const { data, error } = await client
    .from("plan_members")
    .update({ status: "removed" })
    .eq("plan_id", planId)
    .eq("user_id", memberId)
    .neq("status", "removed")
    .select("user_id")
    .maybeSingle()
  if (error) throw new HttpError(500, "internal_error", "Participant could not be removed")
  if (!data) throw new HttpError(404, "not_found", "Participant not found")
  await writeAuditEvent(context.env, {
    action: "participant.removed",
    actorId: context.get("user").id,
    requestId: context.get("requestId"),
    planId,
    metadata: { memberId },
  })
  return context.body(null, 204)
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
  await writeAuditEvent(context.env, {
    action: "invitation.accepted",
    actorId: context.get("user").id,
    requestId: context.get("requestId"),
    planId: result.accepted_plan_id,
  })
  return context.json({ planId: result.accepted_plan_id })
})
