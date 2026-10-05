import { describe, expect, it } from "vitest"
import { activityPlan, dateRangeError, personFromEmail, toggleDaypart } from "./model"
import { parseDate } from "@internationalized/date"

describe("scheduling model", () => {
  it("rejects reversed ranges and more than 62 calendar dates", () => {
    const start = parseDate("2026-10-25")
    expect(dateRangeError({ start, end: parseDate("2026-10-16") })).toContain("on or after")
    expect(dateRangeError({ start, end: start })).toBeNull()
    expect(dateRangeError({ start, end: start.add({ days: 61 }) })).toBeNull()
    expect(dateRangeError({ start, end: start.add({ days: 62 }) })).toContain("62 days")
  })
  it("keeps activity defaults synchronized", () => {
    expect(activityPlan("dinner")).toEqual({
      activityId: "dinner",
      name: "Dinner",
      duration: 90,
    })
  })

  it("treats any time as mutually exclusive", () => {
    expect(toggleDaypart(["Morning"], "Any time")).toEqual(["Any time"])
    expect(toggleDaypart(["Any time"], "Evening")).toEqual(["Evening"])
  })

  it("restores any time when the final preference is removed", () => {
    expect(toggleDaypart(["Evening"], "Evening")).toEqual(["Any time"])
  })

  it("normalizes invitee identity without weakening email validation", () => {
    expect(personFromEmail("  jane.doe@example.com ")).toMatchObject({
      email: "jane.doe@example.com",
      name: "Jane Doe",
      initials: "JD",
      status: "invited",
    })
    expect(personFromEmail("not-an-email")).toBeNull()
  })
})
