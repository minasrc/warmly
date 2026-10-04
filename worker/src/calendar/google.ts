import type {
  CalendarProvider,
  CreateEventRequest,
  CreatedEvent,
  FreeBusyRequest,
  ProviderCalendar,
} from "./provider"
import { HttpError } from "../http-error"
import { providerFetch } from "./provider-fetch"

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"

export class GoogleCalendarProvider implements CalendarProvider {
  async listCalendars(accessToken: string): Promise<ProviderCalendar[]> {
    const calendars: ProviderCalendar[] = []
    let pageToken: string | undefined

    do {
      const url = new URL(`${GOOGLE_CALENDAR_API}/users/me/calendarList`)
      url.searchParams.set("minAccessRole", "reader")
      if (pageToken) url.searchParams.set("pageToken", pageToken)
      const payload = await googleRequest<GoogleCalendarList>(url, accessToken)
      calendars.push(...payload.items.map((calendar) => ({
        id: calendar.id,
        name: calendar.summary,
        primary: calendar.primary ?? false,
        writable: calendar.accessRole === "owner" || calendar.accessRole === "writer",
        ...(calendar.timeZone ? { timeZone: calendar.timeZone } : {}),
      })))
      pageToken = payload.nextPageToken
    } while (pageToken)

    return calendars
  }

  async queryFreeBusy(request: FreeBusyRequest) {
    const batches = chunk(request.calendarIds, 50)
    const payloads = await Promise.all(batches.map((calendarIds) =>
      googleRequest<GoogleFreeBusyResponse>(new URL(`${GOOGLE_CALENDAR_API}/freeBusy`), request.accessToken, {
        method: "POST",
        body: JSON.stringify({
          timeMin: request.timeMin,
          timeMax: request.timeMax,
          timeZone: request.timeZone,
          items: calendarIds.map((id) => ({ id })),
        }),
      }),
    ))

    const calendars = Object.assign({}, ...payloads.map((payload) => payload.calendars)) as GoogleFreeBusyResponse["calendars"]
    if (request.calendarIds.some((id) => !calendars[id]?.busy || calendars[id]?.errors?.length)) {
      throw new HttpError(502, "provider_error", "Calendar availability could not be verified")
    }
    return Object.fromEntries(Object.entries(calendars).map(([calendarId, calendar]) => [
      calendarId,
      calendar.busy.map((interval) => ({ start: interval.start, end: interval.end })),
    ]))
  }

  async findCreatedEvent(request: Pick<CreateEventRequest, "accessToken" | "calendarId" | "idempotencyKey" | "startsAt" | "endsAt">): Promise<CreatedEvent | null> {
    const eventId = request.idempotencyKey.replaceAll("-", "")
    const url = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(request.calendarId)}/events/${eventId}`)
    const response = await providerFetch(fetch, url, { headers: { authorization: `Bearer ${request.accessToken}` } })
    if (response.status === 404) return null
    if (!response.ok) throw new HttpError(502, "provider_error", "Booking could not be reconciled")
    const event = await response.json<GoogleEvent>()
    if (event.extendedProperties?.private?.warmlyIdempotencyKey !== request.idempotencyKey
      || Date.parse(event.start?.dateTime ?? "") !== Date.parse(request.startsAt)
      || Date.parse(event.end?.dateTime ?? "") !== Date.parse(request.endsAt)
      || event.status === "cancelled") {
      throw new HttpError(409, "conflict", "The calendar event does not match this booking")
    }
    return { id: event.id, ...(event.htmlLink ? { htmlLink: event.htmlLink } : {}) }
  }

  async createEvent(request: CreateEventRequest): Promise<CreatedEvent> {
    const url = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(request.calendarId)}/events`)
    url.searchParams.set("sendUpdates", "all")
    const eventId = request.idempotencyKey.replaceAll("-", "")
    let payload: GoogleEvent
    try {
      payload = await googleRequest<GoogleEvent>(url, request.accessToken, {
        method: "POST",
        body: JSON.stringify({
          id: eventId,
          summary: request.title,
          description: request.description,
          start: { dateTime: request.startsAt, timeZone: request.timeZone },
          end: { dateTime: request.endsAt, timeZone: request.timeZone },
          attendees: request.attendeeEmails.map((email) => ({ email })),
          extendedProperties: { private: { warmlyIdempotencyKey: request.idempotencyKey } },
        }),
      })
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error
      const existing = await this.findCreatedEvent(request)
      if (!existing) throw new HttpError(409, "conflict", "Calendar event could not be reconciled")
      return existing
    }
    return { id: payload.id, ...(payload.htmlLink ? { htmlLink: payload.htmlLink } : {}) }
  }
}

async function googleRequest<T>(url: URL, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await providerFetch(fetch, url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
      authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    if (response.status === 409) throw new HttpError(409, "conflict", "Google Calendar event already exists")
    const retryable = response.status === 429 || response.status >= 500
    throw new HttpError(retryable ? 502 : 422, "provider_error", "Google Calendar request failed")
  }
  return response.json<T>()
}

type GoogleCalendarList = {
  items: Array<{ id: string; summary: string; primary?: boolean; timeZone?: string; accessRole?: string }>
  nextPageToken?: string
}

type GoogleFreeBusyResponse = {
  calendars: Record<string, { busy: Array<{ start: string; end: string }>; errors?: unknown[] }>
}

type GoogleEvent = {
  id: string
  htmlLink?: string
  status?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  extendedProperties?: { private?: { warmlyIdempotencyKey?: string } }
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size))
}
