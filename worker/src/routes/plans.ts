import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { requireUser } from "../middleware/auth"
import { HttpError } from "../http-error"
import { PlanRepository } from "../repositories/plans"
import { createAdminClient, createUserClient } from "../supabase"
import { parseId, parseJson } from "../validation"
import { writeAuditEvent } from "../audit"
import { Temporal } from "@js-temporal/polyfill"

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
  allowedDayparts: z.array(z.enum(["morning", "afternoon", "evening"])).max(3).default([]),
  requireAll: z.boolean().default(true),
}).refine((input) => {
  const start = Temporal.PlainDate.from(input.startDate)
  const end = Temporal.PlainDate.from(input.endDate)
  return Temporal.PlainDate.compare(end, start) >= 0 && Temporal.PlainDate.compare(end, start.add({ days: 61 })) <= 0
}, "Choose between 1 and 62 calendar dates").refine((input) => input.dayStart < input.dayEnd, "The daily window must end after it starts")

const planStatusSchema = z.object({
  status: z.enum(["collecting", "cancelled"]),
})

export const plans = new Hono<AppEnvironment>()

plans.use("*", requireUser)

plans.get("/", async (context) => {
  const { data, error } = await createUserClient(context.env, context.get("accessToken"))
    .from("plans").select("*").eq("host_id", context.get("user").id).order("created_at", { ascending: false }).limit(50)
  if (error) throw new HttpError(503, "temporarily_unavailable", "Plans could not be loaded")
  return context.json({ plans: data ?? [] })
})

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
    allowed_dayparts: input.allowedDayparts,
    require_all: input.requireAll,
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
  const plan = await repository.find(planId)
  const { data: host } = await createAdminClient(context.env).from("profiles").select("display_name").eq("id", plan.host_id).maybeSingle()
  const { data: booking } = await createUserClient(context.env, context.get("accessToken"))
    .from("bookings").select("starts_at,ends_at").eq("plan_id", planId).eq("status", "created").maybeSingle()
  return context.json({ plan, hostName: host?.display_name ?? "A friend", bookedMoment: booking ? { startsAt: booking.starts_at, endsAt: booking.ends_at } : null })
})

plans.get("/:planId/people", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const repository = new PlanRepository(createUserClient(context.env, context.get("accessToken")))
  const plan = await repository.find(planId)
  if (plan.host_id !== context.get("user").id) throw new HttpError(403, "forbidden", "Only the host can view participant status")
  const admin = createAdminClient(context.env)
  const [{ data: members, error: membersError }, { data: invitations, error: invitationsError }] = await Promise.all([
    admin.from("plan_members").select("user_id,role,profiles(email,display_name)").eq("plan_id", planId).neq("status", "removed"),
    admin.from("invitations").select("id,email").eq("plan_id", planId).eq("status", "pending"),
  ])
  if (membersError || invitationsError) throw new HttpError(503, "temporarily_unavailable", "Participant status could not be loaded")
  const userIds = (members ?? []).map((member) => member.user_id)
  const { data: connections, error: connectionsError } = await admin.from("calendar_connections")
    .select("user_id,selected_calendars(provider_calendar_id)").in("user_id", userIds).eq("status", "active")
  if (connectionsError) throw new HttpError(503, "temporarily_unavailable", "Participant status could not be loaded")
  const readyUsers = new Set((connections ?? []).filter((connection) => connection.selected_calendars.length).map((connection) => connection.user_id))
  const people = (members ?? []).map((member) => {
    const profile = member.profiles as unknown as { email: string; display_name: string | null }
    return {
      userId: member.user_id,
      email: profile.email,
      name: profile.display_name,
      status: member.role === "host" ? "host" : readyUsers.has(member.user_id) ? "ready" : "joined",
    }
  })
  return context.json({ people, invitations })
})

plans.patch("/:planId/status", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const { status } = await parseJson(context.req.raw, planStatusSchema)
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data: current } = await client.from("plans").select("status,host_id").eq("id", planId).maybeSingle()
  if (!current) throw new HttpError(404, "not_found", "Plan not found")
  if (current.host_id !== context.get("user").id) throw new HttpError(403, "forbidden", "Only the host can change plan status")
  const transitionAllowed = current.status === "draft"
    ? status === "collecting" || status === "cancelled"
    : current.status === "collecting" && status === "cancelled"
  if (!transitionAllowed) throw new HttpError(409, "conflict", "Plan status cannot be changed")
  const { data: plan, error } = await createAdminClient(context.env).rpc("transition_plan_status", {
    requested_plan_id: planId, requested_user_id: context.get("user").id, requested_status: status,
  })
  if (error?.code === "P0001") throw new HttpError(409, "conflict", "Plan status cannot be changed while booking is in progress or complete")
  if (error) throw new HttpError(503, "temporarily_unavailable", "Plan status could not be saved")
  await writeAuditEvent(context.env, {
    action: `plan.${status}`,
    actorId: context.get("user").id,
    requestId: context.get("requestId"),
    planId,
  })
  return context.json({ plan })
})
