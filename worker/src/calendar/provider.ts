import type { BusyInterval } from "@warmly/domain"

export type ProviderCalendar = {
  id: string
  name: string
  primary: boolean
  timeZone?: string
}

export type FreeBusyRequest = {
  accessToken: string
  calendarIds: string[]
  timeMin: string
  timeMax: string
  timeZone: string
}

export type CreateEventRequest = {
  accessToken: string
  calendarId: string
  idempotencyKey: string
  title: string
  description?: string
  startsAt: string
  endsAt: string
  timeZone: string
  attendeeEmails: string[]
}

export type CreatedEvent = {
  id: string
  htmlLink?: string
}

export interface CalendarProvider {
  listCalendars(accessToken: string): Promise<ProviderCalendar[]>
  queryFreeBusy(request: FreeBusyRequest): Promise<Record<string, BusyInterval[]>>
  createEvent(request: CreateEventRequest): Promise<CreatedEvent>
}
