import { describe, expect, it } from "vitest"
import { activityPlan, personFromEmail, toggleDaypart } from "./model"

describe("scheduling model", () => {
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
