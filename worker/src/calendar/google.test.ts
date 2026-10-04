import { afterEach, describe, expect, it, vi } from "vitest"
import { GoogleCalendarProvider } from "./google"

afterEach(() => vi.unstubAllGlobals())

describe("GoogleCalendarProvider", () => {
  it("batches FreeBusy requests at Google's 50-calendar limit", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string }> }
      return Response.json({
        calendars: Object.fromEntries(body.items.map(({ id }) => [id, { busy: [] }])),
      })
    })
    vi.stubGlobal("fetch", fetcher)
    const provider = new GoogleCalendarProvider()
    const calendarIds = Array.from({ length: 51 }, (_, index) => `calendar-${index}`)

    const result = await provider.queryFreeBusy({
      accessToken: "access-token",
      calendarIds,
      timeMin: "2026-10-12T13:00:00Z",
      timeMax: "2026-10-12T16:00:00Z",
      timeZone: "America/New_York",
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(Object.keys(result)).toHaveLength(51)
  })

  it("uses a deterministic event ID and resolves a retry without creating a duplicate", async () => {
    const requestBodies: string[] = []
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        requestBodies.push(String(init.body))
        return new Response(null, { status: 409 })
      }
      return Response.json({
        id: "123e4567e89b12d3a456426614174000",
        start: { dateTime: "2026-10-12T13:00:00Z" },
        end: { dateTime: "2026-10-12T14:00:00Z" },
        extendedProperties: { private: { warmlyIdempotencyKey: "123e4567-e89b-12d3-a456-426614174000" } },
      })
    })
    vi.stubGlobal("fetch", fetcher)
    const provider = new GoogleCalendarProvider()

    const event = await provider.createEvent({
      accessToken: "access-token",
      calendarId: "primary",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
      title: "Coffee",
      startsAt: "2026-10-12T13:00:00Z",
      endsAt: "2026-10-12T14:00:00Z",
      timeZone: "America/New_York",
      attendeeEmails: ["friend@example.com"],
    })

    expect(JSON.parse(requestBodies[0] ?? "{}")).toMatchObject({
      id: "123e4567e89b12d3a456426614174000",
      summary: "Coffee",
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(event.id).toBe("123e4567e89b12d3a456426614174000")
  })

  it.each([
    { calendars: { primary: { busy: [], errors: [{ reason: "notFound" }] } } },
    { calendars: {} },
  ])("does not treat per-calendar errors or missing results as free", async (payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)))
    await expect(new GoogleCalendarProvider().queryFreeBusy({
      accessToken: "token", calendarIds: ["primary"], timeMin: "2026-10-12T13:00:00Z",
      timeMax: "2026-10-12T14:00:00Z", timeZone: "UTC",
    })).rejects.toThrow("Calendar availability could not be verified")
  })

  it("distinguishes read-only calendars from writable calendars", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [
      { id: "read", summary: "Read-only", accessRole: "reader" },
      { id: "write", summary: "Writable", accessRole: "writer" },
    ] })))
    expect((await new GoogleCalendarProvider().listCalendars("token")).map((calendar) => calendar.writable)).toEqual([false, true])
  })

  it("rejects an event ID collision that does not match the booking", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "unrelated" })))
    await expect(new GoogleCalendarProvider().findCreatedEvent({
      accessToken: "token", calendarId: "primary", idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
      startsAt: "2026-10-12T13:00:00Z", endsAt: "2026-10-12T14:00:00Z",
    })).rejects.toThrow("does not match this booking")
  })
})
