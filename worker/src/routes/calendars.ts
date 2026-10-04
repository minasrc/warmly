import { Hono, type Context } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { GoogleCalendarProvider } from "../calendar/google"
import { GoogleOAuthClient } from "../calendar/google-oauth"
import { parseEnvironment } from "../env"
import { HttpError } from "../http-error"
import { requireUser } from "../middleware/auth"
import { createAdminClient, createUserClient } from "../supabase"
import { parseId, parseJson } from "../validation"

const selectionSchema = z.object({
  calendarIds: z.array(z.string().min(1)).min(1).max(50),
})

export const calendars = new Hono<AppEnvironment>()
calendars.use("*", requireUser)

calendars.get("/connections", async (context) => {
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data, error } = await client
    .from("calendar_connections")
    .select("id,provider,account_email,status,connected_at,selected_calendars(provider_calendar_id,display_name,time_zone,is_primary)")
    .order("connected_at")
  if (error) throw new HttpError(500, "internal_error", "Calendar connections could not be loaded")
  return context.json({ connections: data })
})

calendars.get("/connections/:connectionId/calendars", async (context) => {
  const connectionId = parseId(context.req.param("connectionId"))
  const accessToken = await accessTokenForConnection(context, connectionId)
  const provider = new GoogleCalendarProvider()
  return context.json({ calendars: await provider.listCalendars(accessToken) })
})

calendars.put("/connections/:connectionId/calendars", async (context) => {
  const connectionId = parseId(context.req.param("connectionId"))
  const { calendarIds } = await parseJson(context.req.raw, selectionSchema)
  const accessToken = await accessTokenForConnection(context, connectionId)
  const provider = new GoogleCalendarProvider()
  const providerCalendars = await provider.listCalendars(accessToken)
  const byId = new Map(providerCalendars.map((calendar) => [calendar.id, calendar]))
  const selected = calendarIds.map((id) => byId.get(id))
  if (selected.some((calendar) => !calendar)) {
    throw new HttpError(400, "bad_request", "Calendar selection contains an unknown calendar")
  }
  const verified = selected.filter((calendar) => calendar !== undefined)
  const client = createUserClient(context.env, context.get("accessToken"))
  const { error } = await client.rpc("replace_selected_calendars", {
    requested_connection_id: connectionId,
    calendar_ids: verified.map((calendar) => calendar.id),
    calendar_names: verified.map((calendar) => calendar.name),
    calendar_time_zones: verified.map((calendar) => calendar.timeZone ?? ""),
    calendar_primary_flags: verified.map((calendar) => calendar.primary),
  })
  if (error) throw new HttpError(422, "bad_request", "Calendar selection could not be saved")
  return context.json({ calendars: verified })
})

async function accessTokenForConnection(context: Context<AppEnvironment>, connectionId: string) {
  const userId = context.get("user").id
  const client = createUserClient(context.env, context.get("accessToken"))
  const { data: connection } = await client
    .from("calendar_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!connection) throw new HttpError(404, "not_found", "Calendar connection not found")

  const admin = createAdminClient(context.env)
  const { data: refreshToken, error } = await admin.rpc("get_calendar_refresh_token", {
    requested_connection_id: connectionId,
    requested_user_id: userId,
  })
  if (error || typeof refreshToken !== "string") {
    throw new HttpError(409, "conflict", "Calendar connection needs to be reconnected")
  }
  const environment = parseEnvironment(context.env)
  const oauth = new GoogleOAuthClient({
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
  })
  return (await oauth.refresh(refreshToken)).access_token
}
