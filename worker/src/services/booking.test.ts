import { describe, expect, it } from "vitest"
import { HttpError } from "../http-error"
import { chooseBookingCalendar, requireCurrentCandidate, validateBookingRetry } from "./booking"

const moment = {
  startsAt: "2026-10-12T13:00:00Z",
  endsAt: "2026-10-12T14:00:00Z",
}

describe("booking orchestration boundaries", () => {
  it("rejects a moment removed by the final availability recheck", () => {
    expect(() => requireCurrentCandidate([], moment)).toThrowError(
      expect.objectContaining({ status: 409, message: "That moment is no longer available" }),
    )
  })

  it("accepts equivalent offset representations of the rechecked moment", () => {
    const candidate = requireCurrentCandidate([{
      start: "2026-10-12T09:00:00-04:00",
      end: "2026-10-12T10:00:00-04:00",
      timeZone: "America/New_York",
      availableParticipantIds: [],
      unavailableCount: 0,
      score: 0,
    }], moment)
    expect(candidate.start).toBe("2026-10-12T09:00:00-04:00")
  })

  it("rejects reuse of an idempotency key for another plan or moment", () => {
    const existing = {
      plan_id: "plan-a",
      starts_at: moment.startsAt,
      ends_at: moment.endsAt,
    }
    expect(() => validateBookingRetry(existing, "plan-b", moment)).toThrow(HttpError)
    expect(() => validateBookingRetry(existing, "plan-a", {
      ...moment,
      startsAt: "2026-10-12T14:00:00Z",
    })).toThrow(HttpError)
  })

  it("prefers the primary writable calendar", () => {
    expect(chooseBookingCalendar([
      { provider_calendar_id: "secondary", is_primary: false },
      { provider_calendar_id: "primary", is_primary: true },
    ])?.provider_calendar_id).toBe("primary")
  })
})
