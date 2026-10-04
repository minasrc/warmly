import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { GoogleCalendarProvider } from "../calendar/google"
import { GoogleOAuthClient } from "../calendar/google-oauth"
import { parseEnvironment } from "../env"
import { HttpError } from "../http-error"
import { requireUser } from "../middleware/auth"
import { loadPlanCandidates } from "../services/plan-candidates"
import { createAdminClient, createUserClient } from "../supabase"
import { PlanRepository } from "../repositories/plans"
import { parseId, parseJson } from "../validation"
import { writeAuditEvent } from "../audit"
import { chooseBookingCalendar, requireCurrentCandidate, validateBookingRetry } from "../services/booking"

const bookingSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  idempotencyKey: z.uuid(),
})

const EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events"

export const bookings = new Hono<AppEnvironment>()
bookings.use("*", requireUser)

bookings.get("/:planId/bookings", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const plan = await new PlanRepository(createUserClient(context.env, context.get("accessToken"))).find(planId)
  if (plan.host_id !== context.get("user").id) throw new HttpError(403, "forbidden", "Only the host can view booking state")
  const { data, error } = await createAdminClient(context.env).from("bookings")
    .select("id,status,starts_at,ends_at,idempotency_key").eq("plan_id", planId).maybeSingle()
  if (error) throw new HttpError(503, "temporarily_unavailable", "Booking state could not be loaded")
  return context.json({ booking: data })
})

bookings.post("/:planId/bookings", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const input = await parseJson(context.req.raw, bookingSchema)
  const user = context.get("user")
  const plan = await new PlanRepository(createUserClient(context.env, context.get("accessToken"))).find(planId)
  if (plan.host_id !== user.id) throw new HttpError(403, "forbidden", "Only the host can book a plan")

  const admin = createAdminClient(context.env)
  const { data: existing, error: existingError } = await admin
    .from("bookings").select().eq("idempotency_key", input.idempotencyKey).maybeSingle()
  if (existingError) throw new HttpError(503, "temporarily_unavailable", "Booking state could not be checked")
  if (existing) validateBookingRetry(existing, planId, input)
  if (existing?.status === "created") return context.json({ booking: existing })
  if (plan.status !== "collecting") throw new HttpError(409, "conflict", "This plan is not collecting responses")
  if (existing && (!existing.connection_id || !existing.provider_calendar_id)) {
    throw new HttpError(409, "conflict", "This booking needs reconciliation")
  }
  let connectionQuery = admin
    .from("calendar_connections")
    .select("id,granted_scopes,selected_calendars(provider_calendar_id,is_primary)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .contains("granted_scopes", [EVENTS_SCOPE])
  if (existing) connectionQuery = connectionQuery.eq("id", existing.connection_id)
  const { data: connection } = await connectionQuery.limit(1).maybeSingle()
  const selectedCalendars = connection?.selected_calendars as Array<{
    provider_calendar_id: string
    is_primary: boolean
  }> | undefined
  if (!connection) {
    throw new HttpError(409, "conflict", "Event creation permission is required")
  }

  const [{ data: refreshToken }, { data: memberRows, error: membersError }] = await Promise.all([
    admin.rpc("get_calendar_refresh_token", {
      requested_connection_id: connection.id,
      requested_user_id: user.id,
    }),
    admin.from("plan_members").select("profiles(email)").eq("plan_id", planId).neq("status", "removed"),
  ])
  if (membersError) throw new HttpError(503, "temporarily_unavailable", "Participants could not be verified")
  if (typeof refreshToken !== "string") throw new HttpError(409, "conflict", "Calendar connection needs to be reconnected")
  const environment = parseEnvironment(context.env)
  const oauth = new GoogleOAuthClient({
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
  })
  const accessToken = (await oauth.refresh(refreshToken)).access_token
  const provider = new GoogleCalendarProvider()
  const writableCalendars = (await provider.listCalendars(accessToken)).filter((calendar) => calendar.writable)
  const calendarId = existing?.provider_calendar_id ?? chooseBookingCalendar(selectedCalendars?.filter((calendar) =>
    writableCalendars.some((providerCalendar) => providerCalendar.id === calendar.provider_calendar_id),
  ))?.provider_calendar_id
  if (!calendarId || !writableCalendars.some((calendar) => calendar.id === calendarId)) {
    throw new HttpError(409, "conflict", "Select a writable calendar for this event")
  }
  const finish = async (eventId: string) => {
    const { data: booking, error } = await admin.rpc("finalize_calendar_booking", {
      requested_idempotency_key: input.idempotencyKey,
      requested_event_id: eventId,
    })
    if (error || !booking) throw new HttpError(500, "internal_error", "Event was created but booking state needs reconciliation")
    await writeAuditEvent(context.env, {
      action: "booking.created", actorId: user.id, requestId: context.get("requestId"), planId,
      metadata: { bookingId: booking.id },
    })
    return booking
  }
  if (existing) {
    const event = await provider.findCreatedEvent({ accessToken, calendarId, ...input })
    if (event) return context.json({ booking: await finish(event.id) })
  }
  const { candidates } = await loadPlanCandidates(context.env, context.get("accessToken"), planId)
  requireCurrentCandidate(candidates, input)
  if (!existing) {
    const { error: insertError } = await admin.from("bookings").insert({
      plan_id: planId, created_by: user.id, idempotency_key: input.idempotencyKey,
      starts_at: input.startsAt, ends_at: input.endsAt,
      connection_id: connection.id, provider_calendar_id: calendarId,
    })
    if (insertError?.code === "23505") throw new HttpError(409, "conflict", "This plan is already being booked")
    if (insertError) throw new HttpError(500, "internal_error", "Booking could not be started")
  }
  const attendeeEmails = (memberRows ?? []).flatMap((row) => {
    const profile = row.profiles as unknown as { email: string } | null
    return profile?.email && profile.email !== user.email ? [profile.email] : []
  })
  const event = await provider.createEvent({
    accessToken,
    calendarId,
    idempotencyKey: input.idempotencyKey,
    title: plan.name,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timeZone: plan.time_zone,
    attendeeEmails,
  })
  const booking = await finish(event.id)
  return context.json({ booking }, 201)
})
