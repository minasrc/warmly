import { describe, expect, it } from "vitest"
import type { CalendarProvider } from "../calendar/provider"
import { findAggregateCandidates } from "./availability"

const provider: CalendarProvider = {
  listCalendars: async () => [],
  createEvent: async () => ({ id: "event" }),
  queryFreeBusy: async ({ calendarIds }) => Object.fromEntries(
    calendarIds.map((id) => [id, id === "busy" ? [{
      start: "2026-10-12T14:00:00Z",
      end: "2026-10-12T16:00:00Z",
    }] : []]),
  ),
}

describe("findAggregateCandidates", () => {
  it("merges each participant's calendars and returns aggregate slots only", async () => {
    const result = await findAggregateCandidates(provider, {
      window: {
        startDate: "2026-10-12",
        endDate: "2026-10-12",
        timeZone: "America/New_York",
        dayStart: "09:00",
        dayEnd: "12:00",
        incrementMinutes: 30,
      },
      durationMinutes: 60,
      quorum: 2,
    }, [
      { participantId: "host", connections: [{ accessToken: "host-token", calendarIds: ["free"] }] },
      { participantId: "guest", connections: [{ accessToken: "guest-token", calendarIds: ["busy"] }] },
    ])

    expect(result.map((slot) => slot.start)).toEqual(["2026-10-12T13:00:00Z"])
    expect(JSON.stringify(result)).not.toContain("busy")
    expect(JSON.stringify(result)).not.toContain("token")
  })

  it("queries the exact local scheduling window as UTC instants", async () => {
    let observedRange = { timeMin: "", timeMax: "" }
    const observingProvider: CalendarProvider = {
      ...provider,
      queryFreeBusy: async ({ calendarIds, timeMin, timeMax }) => {
        observedRange = { timeMin, timeMax }
        return Object.fromEntries(calendarIds.map((id) => [id, []]))
      },
    }
    await findAggregateCandidates(observingProvider, {
      window: {
        startDate: "2026-03-08",
        endDate: "2026-03-08",
        timeZone: "America/New_York",
        dayStart: "09:00",
        dayEnd: "12:00",
        incrementMinutes: 30,
      },
      durationMinutes: 60,
      quorum: 1,
    }, [{ participantId: "host", connections: [{ accessToken: "token", calendarIds: ["primary"] }] }])

    expect(observedRange).toEqual({
      timeMin: "2026-03-08T13:00:00Z",
      timeMax: "2026-03-08T16:00:00Z",
    })
  })

  it("treats a participant without a calendar connection as unavailable", async () => {
    const result = await findAggregateCandidates(provider, {
      window: {
        startDate: "2026-10-12",
        endDate: "2026-10-12",
        timeZone: "America/New_York",
        dayStart: "09:00",
        dayEnd: "10:00",
        incrementMinutes: 30,
      },
      durationMinutes: 60,
      quorum: 2,
    }, [
      { participantId: "host", connections: [{ accessToken: "token", calendarIds: ["free"] }] },
      { participantId: "guest", connections: [] },
    ])

    expect(result).toEqual([])
  })
})
