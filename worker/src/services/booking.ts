import type { CandidateSlot } from "@warmly/domain"
import { HttpError } from "../http-error"

type BookingMoment = {
  startsAt: string
  endsAt: string
}

type ExistingBooking = {
  plan_id: string
  starts_at: string
  ends_at: string
}

type SelectedCalendar = {
  provider_calendar_id: string
  is_primary: boolean
}

export function requireCurrentCandidate(candidates: CandidateSlot[], moment: BookingMoment) {
  const candidate = candidates.find((slot) =>
    Date.parse(slot.start) === Date.parse(moment.startsAt)
    && Date.parse(slot.end) === Date.parse(moment.endsAt),
  )
  if (!candidate) throw new HttpError(409, "conflict", "That moment is no longer available")
  return candidate
}

export function validateBookingRetry(existing: ExistingBooking, planId: string, moment: BookingMoment) {
  if (existing.plan_id !== planId) {
    throw new HttpError(409, "conflict", "Idempotency key is already in use")
  }
  if (
    Date.parse(existing.starts_at) !== Date.parse(moment.startsAt)
    || Date.parse(existing.ends_at) !== Date.parse(moment.endsAt)
  ) {
    throw new HttpError(409, "conflict", "Booking retry does not match the original moment")
  }
}

export function chooseBookingCalendar(calendars: SelectedCalendar[] | undefined) {
  return calendars?.find((calendar) => calendar.is_primary) ?? calendars?.[0]
}
