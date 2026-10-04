import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { GoogleCalendarProvider } from "../calendar/google"
import { GoogleOAuthClient } from "../calendar/google-oauth"
import { parseEnvironment } from "../env"
import { HttpError } from "../http-error"
import { requireUser } from "../middleware/auth"
import { loadPlanCandidates } from "../services/plan-candidates"
import { createAdminClient } from "../supabase"
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

bookings.post("/:planId/bookings", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const input = await parseJson(context.req.raw, bookingSchema)
  const user = context.get("user")
  const { plan, candidates } = await loadPlanCandidates(context.env, context.get("accessToken"), planId)
  if (plan.host_id !== user.id) throw new HttpError(403, "forbidden", "Only the host can book a plan")
  if (plan.status !== "collecting") throw new HttpError(409, "conflict", "This plan is not collecting responses")
  requireCurrentCandidate(candidates, input)

  const admin = createAdminClient(context.env)
  const { data: connection } = await admin
    .from("calendar_connections")
    .select("id,granted_scopes,selected_calendars(provider_calendar_id,is_primary)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .contains("granted_scopes", [EVENTS_SCOPE])
    .limit(1)
    .maybeSingle()
  const selectedCalendars = connection?.selected_calendars as Array<{
    provider_calendar_id: string
    is_primary: boolean
  }> | undefined
  const calendar = chooseBookingCalendar(selectedCalendars)
  if (!connection || !calendar) {
    throw new HttpError(409, "conflict", "Event creation permission is required")
  }

  const { data: existing } = await admin
    .from("bookings")
    .select()
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle()
  if (existing) validateBookingRetry(existing, planId, input)
  if (existing?.status === "created") return context.json({ booking: existing })
  if (!existing) {
    const { error: insertError } = await admin.from("bookings").insert({
      plan_id: planId,
      created_by: user.id,
      idempotency_key: input.idempotencyKey,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    })
    if (insertError?.code === "23505") throw new HttpError(409, "conflict", "This plan is already being booked")
    if (insertError) throw new HttpError(500, "internal_error", "Booking could not be started")
  }

  const [{ data: refreshToken }, { data: memberRows }] = await Promise.all([
    admin.rpc("get_calendar_refresh_token", {
      requested_connection_id: connection.id,
      requested_user_id: user.id,
    }),
    admin.from("plan_members").select("profiles(email)").eq("plan_id", planId).neq("status", "removed"),
  ])
  if (typeof refreshToken !== "string") throw new HttpError(409, "conflict", "Calendar connection needs to be reconnected")
  const environment = parseEnvironment(context.env)
  const oauth = new GoogleOAuthClient({
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
  })
  const accessToken = (await oauth.refresh(refreshToken)).access_token
  const attendeeEmails = (memberRows ?? []).flatMap((row) => {
    const profile = row.profiles as unknown as { email: string } | null
    return profile?.email && profile.email !== user.email ? [profile.email] : []
  })
  const event = await new GoogleCalendarProvider().createEvent({
    accessToken,
    calendarId: calendar.provider_calendar_id,
    idempotencyKey: input.idempotencyKey,
    title: plan.name,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timeZone: plan.time_zone,
    attendeeEmails,
  })
  const { data: booking, error: updateError } = await admin
    .from("bookings")
    .update({ status: "created", provider_event_id: event.id, failure_code: null })
    .eq("idempotency_key", input.idempotencyKey)
    .select()
    .single()
  if (updateError) throw new HttpError(500, "internal_error", "Event was created but booking state needs reconciliation")
  await admin.from("plans").update({ status: "booked" }).eq("id", planId)
  await writeAuditEvent(context.env, {
    action: "booking.created",
    actorId: user.id,
    requestId: context.get("requestId"),
    planId,
    metadata: { bookingId: booking.id },
  })
  return context.json({ booking }, 201)
})
