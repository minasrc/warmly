import type { Daypart } from "@warmly/domain"

export type PlanRecord = {
  id: string
  host_id: string
  name: string
  start_date: string
  end_date: string
  duration_minutes: number
  time_zone: string
  status: "draft" | "collecting" | "booked" | "cancelled"
  allowed_dayparts: Daypart[]
}

export type InvitationSummary = {
  plan: Pick<PlanRecord, "id" | "name" | "status" | "start_date" | "end_date" | "duration_minutes" | "time_zone">
  hostName: string
  bookedMoment?: { startsAt: string; endsAt: string } | null
}

export type BookingRecord = {
  id: string
  status: "pending" | "created" | "failed" | "cancelled"
  starts_at: string
  ends_at: string
  idempotency_key: string
}

export type OwnResponse = {
  submittedAt: string | null
  slots: Array<{ startsAt: string; endsAt: string }>
}

export type CalendarConnection = {
  id: string
  provider: "google"
  account_email: string
  status: "active" | "needs_reauth" | "revoked"
  granted_scopes: string[]
  selected_calendars: Array<{ provider_calendar_id: string; display_name: string; is_primary: boolean }>
}

export type PlanPeople = {
  people: Array<{ userId: string; email: string; name: string | null; status: "host" | "ready" | "joined" }>
  invitations: Array<{ id: string; email: string }>
}
