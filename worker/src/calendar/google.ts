import type {
  CalendarProvider,
  CreateEventRequest,
  CreatedEvent,
  FreeBusyRequest,
  ProviderCalendar,
} from "./provider"
import { HttpError } from "../http-error"

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

    return Object.fromEntries(payloads.flatMap((payload) => Object.entries(payload.calendars)).map(([calendarId, calendar]) => [
      calendarId,
      calendar.busy.map((interval) => ({ start: interval.start, end: interval.end })),
    ]))
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
      payload = await googleRequest<GoogleEvent>(
        new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(request.calendarId)}/events/${eventId}`),
        request.accessToken,
      )
    }
    return { id: payload.id, ...(payload.htmlLink ? { htmlLink: payload.htmlLink } : {}) }
  }
}

async function googleRequest<T>(url: URL, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
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
  items: Array<{ id: string; summary: string; primary?: boolean; timeZone?: string }>
  nextPageToken?: string
}

type GoogleFreeBusyResponse = {
  calendars: Record<string, { busy: Array<{ start: string; end: string }> }>
}

type GoogleEvent = { id: string; htmlLink?: string }

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size))
}
