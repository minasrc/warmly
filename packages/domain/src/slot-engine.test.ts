import { describe, expect, it } from "vitest"
import type { CandidateRequest } from "./contracts"
import { computeCandidateSlots } from "./slot-engine"

const baseRequest: CandidateRequest = {
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
  participants: [
    { participantId: "host", busy: [] },
    { participantId: "maya", busy: [] },
  ],
}

describe("computeCandidateSlots", () => {
  it("returns only slots that satisfy duration and quorum", () => {
    const result = computeCandidateSlots({
      ...baseRequest,
      participants: [
        baseRequest.participants[0]!,
        {
          participantId: "maya",
          busy: [{ start: "2026-10-12T14:00:00Z", end: "2026-10-12T16:00:00Z" }],
        },
      ],
    })

    expect(result.map((slot) => slot.start)).toEqual(["2026-10-12T13:00:00Z"])
  })

  it("treats touching intervals as available", () => {
    const result = computeCandidateSlots({
      ...baseRequest,
      window: { ...baseRequest.window, dayEnd: "10:00" },
      participants: [
        baseRequest.participants[0]!,
        {
          participantId: "maya",
          busy: [{ start: "2026-10-12T14:00:00Z", end: "2026-10-12T15:00:00Z" }],
        },
      ],
    })

    expect(result).toHaveLength(1)
  })

  it("preserves local wall-clock hours across daylight-saving changes", () => {
    const result = computeCandidateSlots({
      ...baseRequest,
      window: {
        ...baseRequest.window,
        startDate: "2026-03-07",
        endDate: "2026-03-09",
        dayEnd: "10:00",
      },
    })

    expect(result.map((slot) => slot.start).sort()).toEqual([
      "2026-03-07T14:00:00Z",
      "2026-03-08T13:00:00Z",
      "2026-03-09T13:00:00Z",
    ])
  })

  it("ranks full-group and matching-preference slots first", () => {
    const [first] = computeCandidateSlots({
      ...baseRequest,
      window: { ...baseRequest.window, dayStart: "11:00", dayEnd: "14:00" },
      participants: [
        { participantId: "host", busy: [], preferredDayparts: ["afternoon"] },
        { participantId: "maya", busy: [], preferredDayparts: ["afternoon"] },
      ],
    })

    expect(first?.start).toBe("2026-10-12T16:00:00Z")
  })

  it("rejects unreasonable or internally inconsistent requests", () => {
    expect(() => computeCandidateSlots({ ...baseRequest, quorum: 3 })).toThrow("Invalid quorum")
    expect(() => computeCandidateSlots({
      ...baseRequest,
      participants: [{
        participantId: "host",
        busy: [{ start: "2026-10-12T15:00:00Z", end: "2026-10-12T14:00:00Z" }],
      }],
      quorum: 1,
    })).toThrow("Busy interval start must precede end")
  })
})
