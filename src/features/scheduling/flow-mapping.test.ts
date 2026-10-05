import { describe, expect, it } from "vitest"
import { parseDate } from "@internationalized/date"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { choiceSlots, momentViews, peopleViews, planInput, responseState } from "./flow-mapping"
import { GuestFlow } from "./guest-flow"
import { appMode } from "@/config/environment"

describe("production flow contracts", () => {
  const moments = momentViews([{
    start: "2026-03-08T13:00:00Z", end: "2026-03-08T14:00:00Z", timeZone: "America/New_York",
    availableCount: 2, unavailableCount: 0, score: 1000,
  }])

  it("formats server moments in the plan timezone across DST", () => {
    expect(moments[0]?.time).toMatch(/9:00/)
    expect(moments[0]?.id).toBe("2026-03-08T13:00:00Z")
    expect(moments[0]?.note).toContain("Everyone sharing availability")
  })

  it("restores submitted choices without treating stale choices as completed", () => {
    const response = { submittedAt: "2026-03-08T12:00:00Z", slots: [{ startsAt: moments[0]!.startsAt!, endsAt: moments[0]!.endsAt! }] }
    expect(responseState(moments, response)).toEqual({ selected: [moments[0]!.id], submitted: true })
    expect(responseState([], response)).toEqual({ selected: [], submitted: false })
  })

  it("submits only real candidate instants and rejects stale, duplicate, or excessive choices", () => {
    expect(choiceSlots(moments, [moments[0]!.id])).toEqual([{ startsAt: "2026-03-08T13:00:00Z", endsAt: "2026-03-08T14:00:00Z" }])
    expect(() => choiceSlots(moments, ["fixture"])).toThrow("no longer available")
    expect(() => choiceSlots(moments, [moments[0]!.id, moments[0]!.id])).toThrow("different moments")
    expect(() => choiceSlots(moments, Array.from({ length: 51 }, (_, index) => String(index)))).toThrow("between 1 and 50")
  })

  it("uses ISO dates, all-member overlap, and explicit server dayparts", () => {
    const input = planInput({
      activityId: "custom", name: "  Lunch  ", duration: 60, dayparts: ["Morning", "Evening"],
      dateRange: { start: parseDate("2026-03-07"), end: parseDate("2026-03-09") },
    }, "America/New_York")
    expect(input).toMatchObject({ name: "Lunch", startDate: "2026-03-07", endDate: "2026-03-09", allowedDayparts: ["morning", "evening"], requireAll: true })
  })

  it("builds participant rows only from API state and retains newly issued links in memory", () => {
    const rows = peopleViews({ people: [{ userId: "host", email: "host@example.com", name: "Host", status: "host" }], invitations: [{ id: "invite", email: "guest@example.com" }] }, [
      { name: "Guest", email: "guest@example.com", initials: "G", status: "invited", invitationId: "invite", inviteUrl: "https://example.com/invite/secret" },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[1]?.inviteUrl).toBe("https://example.com/invite/secret")
    expect(rows.some((person) => person.email === "maya@example.com")).toBe(false)
  })

  it("renders the real guest summary and candidate list rather than fixture labels", () => {
    const html = renderToStaticMarkup(createElement(GuestFlow, {
      initialStep: "moments", onStepChange: () => {}, onExit: () => {}, live: true, moments,
      summary: { hostName: "Alex", planName: "Lunch", dateLabel: "Mar 8", durationLabel: "60 minutes" },
    }))
    expect(html).toContain("Lunch")
    expect(html).toContain("Alex")
    expect(html).not.toContain("Maya")
    expect(html).not.toContain("Oct 15")
  })

  it("defaults production to live mode and never silently falls back to fixtures", () => {
    expect(appMode({ PROD: true })).toBe("live")
    expect(appMode({ PROD: false })).toBe("preview")
    expect(appMode({ PROD: true, VITE_APP_MODE: "preview" })).toBe("preview")
    expect(() => appMode({ VITE_APP_MODE: "typo" })).toThrow("live or preview")
  })
})
