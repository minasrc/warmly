import type { Daypart } from "@warmly/domain"
import type { Bindings } from "../env"
import { parseEnvironment } from "../env"
import { GoogleCalendarProvider } from "../calendar/google"
import { GoogleOAuthClient } from "../calendar/google-oauth"
import { HttpError } from "../http-error"
import { createAdminClient, createUserClient } from "../supabase"
import { findAggregateCandidates, type ConnectedParticipant } from "./availability"

export async function loadPlanCandidates(
  bindings: Bindings,
  accessToken: string,
  planId: string,
) {
  const userClient = createUserClient(bindings, accessToken)
  const { data: plan } = await userClient
    .from("plans")
    .select("id,name,host_id,status,start_date,end_date,duration_minutes,time_zone,day_start,day_end,increment_minutes,quorum")
    .eq("id", planId)
    .maybeSingle()
  if (!plan) throw new HttpError(404, "not_found", "Plan not found")

  const admin = createAdminClient(bindings)
  const { data: members, error } = await admin
    .from("plan_members")
    .select("user_id")
    .eq("plan_id", planId)
    .neq("status", "removed")
  if (error || !members?.length) throw new HttpError(500, "internal_error", "Availability could not be loaded")
  if (plan.quorum > members.length) {
    throw new HttpError(409, "conflict", "The plan does not have enough participants for its quorum")
  }
  const userIds = members.map((member) => member.user_id)
  const [{ data: preferences }, { data: connections }] = await Promise.all([
    admin.from("availability_preferences")
      .select("user_id,preferred_dayparts")
      .eq("plan_id", planId)
      .in("user_id", userIds),
    admin.from("calendar_connections")
      .select("id,user_id,status,selected_calendars(provider_calendar_id)")
      .in("user_id", userIds),
  ])
  const preferencesByUser = new Map(
    (preferences ?? []).map((preference) => [preference.user_id, preference.preferred_dayparts as Daypart[]]),
  )
  const environment = parseEnvironment(bindings)
  const oauth = new GoogleOAuthClient({
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
  })
  const participants: ConnectedParticipant[] = await Promise.all(members.map(async (member) => {
    const memberConnections = (connections as Array<{
        id: string
        user_id: string
        status: string
        selected_calendars: Array<{ provider_calendar_id: string }>
      }> ?? []).filter((connection) =>
        connection.user_id === member.user_id
        && connection.status === "active"
        && connection.selected_calendars.length,
      )
    const resolved = await Promise.all(memberConnections.map(async (connection) => {
      try {
        const { data: refreshToken } = await admin.rpc("get_calendar_refresh_token", {
          requested_connection_id: connection.id,
          requested_user_id: member.user_id,
        })
        if (typeof refreshToken !== "string") {
          throw new Error("refresh token unavailable")
        }
        return {
          accessToken: (await oauth.refresh(refreshToken)).access_token,
          calendarIds: connection.selected_calendars.map((calendar) => calendar.provider_calendar_id),
        }
      } catch {
        await admin.from("calendar_connections").update({ status: "needs_reauth" }).eq("id", connection.id)
        return null
      }
    }))
    return {
      participantId: member.user_id,
      preferredDayparts: preferencesByUser.get(member.user_id) ?? [],
      connections: resolved.some((connection) => connection === null)
        ? []
        : resolved.filter((connection) => connection !== null),
    }
  }))

  const candidates = await findAggregateCandidates(new GoogleCalendarProvider(), {
    window: {
      startDate: plan.start_date,
      endDate: plan.end_date,
      timeZone: plan.time_zone,
      dayStart: plan.day_start,
      dayEnd: plan.day_end,
      incrementMinutes: plan.increment_minutes,
    },
    durationMinutes: plan.duration_minutes,
    quorum: plan.quorum,
  }, participants)
  return { plan, candidates }
}
