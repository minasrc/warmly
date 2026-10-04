import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { requireUser } from "../middleware/auth"
import { HttpError } from "../http-error"
import { PlanRepository } from "../repositories/plans"
import { createUserClient } from "../supabase"
import { parseId, parseJson } from "../validation"
import { writeAuditEvent } from "../audit"

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  durationMinutes: z.number().int().min(15).max(1440),
  timeZone: z.string().trim().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value })
      return true
    } catch {
      return false
    }
  }, "Invalid time zone"),
  dayStart: z.iso.time({ precision: -1 }),
  dayEnd: z.iso.time({ precision: -1 }),
  quorum: z.number().int().min(1).max(50),
  incrementMinutes: z.number().int().min(5).max(120).default(30),
})

const planStatusSchema = z.object({
  status: z.enum(["collecting", "cancelled"]),
})

export const plans = new Hono<AppEnvironment>()

plans.use("*", requireUser)

plans.post("/", async (context) => {
  const input = await parseJson(context.req.raw, createPlanSchema)
  const user = context.get("user")
  const repository = new PlanRepository(createUserClient(context.env, context.get("accessToken")))
  const plan = await repository.create({
    host_id: user.id,
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
    duration_minutes: input.durationMinutes,
    time_zone: input.timeZone,
    day_start: input.dayStart,
    day_end: input.dayEnd,
    quorum: input.quorum,
    increment_minutes: input.incrementMinutes,
  })
  await writeAuditEvent(context.env, {
    action: "plan.created",
    actorId: user.id,
    requestId: context.get("requestId"),
    planId: plan.id,
  })
  return context.json({ plan }, 201)
})

plans.get("/:planId", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const repository = new PlanRepository(createUserClient(context.env, context.get("accessToken")))
  return context.json({ plan: await repository.find(planId) })
})

plans.patch("/:planId/status", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const { status } = await parseJson(context.req.raw, planStatusSchema)
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data: current } = await client.from("plans").select("status").eq("id", planId).maybeSingle()
  if (!current) throw new HttpError(404, "not_found", "Plan not found")
  const transitionAllowed = current.status === "draft"
    ? status === "collecting" || status === "cancelled"
    : current.status === "collecting" && status === "cancelled"
  if (!transitionAllowed) throw new HttpError(409, "conflict", "Plan status cannot be changed")
  const { data: plan, error } = await client
    .from("plans")
    .update({ status })
    .eq("id", planId)
    .select()
    .single()
  if (error) throw new HttpError(403, "forbidden", "Only the host can change plan status")
  await writeAuditEvent(context.env, {
    action: `plan.${status}`,
    actorId: context.get("user").id,
    requestId: context.get("requestId"),
    planId,
  })
  return context.json({ plan })
})
