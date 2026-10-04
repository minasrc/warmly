import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { HttpError } from "../http-error"
import { requireUser } from "../middleware/auth"
import { loadPlanCandidates } from "../services/plan-candidates"
import { createAdminClient, createUserClient } from "../supabase"
import { parseId, parseJson } from "../validation"

const responseSchema = z.object({
  timeZone: z.string().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value })
      return true
    } catch {
      return false
    }
  }, "Invalid time zone"),
  slots: z.array(z.object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })).min(1).max(50),
})

export const responses = new Hono<AppEnvironment>()
responses.use("*", requireUser)

responses.put("/:planId/response", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const input = await parseJson(context.req.raw, responseSchema)
  const { candidates } = await loadPlanCandidates(context.env, context.get("accessToken"), planId)
  const validSlots = new Set(
    candidates.map((candidate) => `${Date.parse(candidate.start)}/${Date.parse(candidate.end)}`),
  )
  if (input.slots.some((slot) =>
    !validSlots.has(`${Date.parse(slot.startsAt)}/${Date.parse(slot.endsAt)}`),
  )) {
    throw new HttpError(409, "conflict", "One or more moments are no longer available")
  }
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data: responseId, error } = await client.rpc("save_guest_response", {
    response_plan_id: planId,
    response_time_zone: input.timeZone,
    response_starts_at: input.slots.map((slot) => slot.startsAt),
    response_ends_at: input.slots.map((slot) => slot.endsAt),
  })
  if (error) throw new HttpError(422, "bad_request", "Availability choices could not be saved")
  return context.json({ responseId, selectedCount: input.slots.length })
})

responses.get("/:planId/response-summary", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data: plan } = await client.from("plans").select("host_id").eq("id", planId).maybeSingle()
  if (!plan) throw new HttpError(404, "not_found", "Plan not found")
  if (plan.host_id !== context.get("user").id) {
    throw new HttpError(403, "forbidden", "Only the host can view response totals")
  }

  const admin = createAdminClient(context.env)
  const { data: planResponses } = await admin.from("guest_responses").select("id").eq("plan_id", planId)
  const responseIds = (planResponses ?? []).map((response) => response.id)
  if (!responseIds.length) return context.json({ moments: [] })
  const { data: slots, error } = await admin
    .from("guest_response_slots")
    .select("starts_at,ends_at")
    .in("response_id", responseIds)
  if (error) throw new HttpError(500, "internal_error", "Response totals could not be loaded")
  const totals = new Map<string, { startsAt: string; endsAt: string; responseCount: number }>()
  for (const slot of slots ?? []) {
    const key = `${slot.starts_at}/${slot.ends_at}`
    const current = totals.get(key)
    totals.set(key, {
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      responseCount: (current?.responseCount ?? 0) + 1,
    })
  }
  return context.json({ moments: [...totals.values()] })
})
