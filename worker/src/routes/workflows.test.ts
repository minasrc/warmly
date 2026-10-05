import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppEnvironment } from "../context"
import { HttpError } from "../http-error"
import { bookings } from "./bookings"
import { availability } from "./availability"
import { plans } from "./plans"
import { invitationAccess, invitationManagement } from "./invitations"
import { responses } from "./responses"
import { calendars } from "./calendars"

const state = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  plan: { id: "22222222-2222-4222-8222-222222222222", host_id: "11111111-1111-4111-8111-111111111111", status: "collecting", name: "Lunch", time_zone: "UTC" },
  existing: null as Record<string, unknown> | null,
  available: true,
  eventExists: false,
  finalizeFailure: false,
  calls: [] as string[],
  invitationOutcome: "accepted",
  invitationStatus: "pending",
  activeMember: false,
  response: null as Record<string, unknown> | null,
  filters: [] as Array<[string, string, unknown]>,
  connections: [] as Array<{ id: string; granted_scopes: string[]; selected_calendars: Array<{ provider_calendar_id: string; is_primary: boolean }> }>,
  savedCalendars: null as Record<string, unknown> | null,
  cancelDuringRecheck: false,
  responseParameters: null as Record<string, unknown> | null,
}))
const input = {
  startsAt: "2026-10-12T13:00:00Z", endsAt: "2026-10-12T14:00:00Z",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
}

vi.mock("../middleware/auth", () => ({
  requireUser: async (context: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    context.set("user", { id: state.userId, email: "host@example.com" })
    context.set("accessToken", "user-token")
    context.set("requestId", "request-id")
    await next()
  },
}))
vi.mock("../env", () => ({ parseEnvironment: () => ({ GOOGLE_CLIENT_ID: "fake", GOOGLE_CLIENT_SECRET: "fake", GOOGLE_REDIRECT_URI: "https://example.com/callback" }) }))
vi.mock("../audit", () => ({ writeAuditEvent: async () => {} }))
vi.mock("../supabase", () => {
  function client() {
    return {
      from(table: string) {
        let connectionId: unknown
        const value = () => table === "plans" ? state.plan : table === "bookings" ? state.existing
          : table === "invitations" ? { id: "invitation", plan_id: state.plan.id, status: state.invitationStatus, expires_at: "2030-01-01T00:00:00Z" }
          : table === "plan_members" ? state.activeMember ? { user_id: "guest" } : null
          : table === "guest_responses" ? state.response
          : table === "calendar_connections" ? state.connections[0] : []
        const chain = {
          select: () => chain,
          eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); if (key === "id") connectionId = value; return chain },
          neq: () => chain, contains: () => chain, limit: () => chain, order: () => chain, in: () => chain,
          maybeSingle: async () => ({ data: value(), error: null }),
          single: async () => ({ data: value(), error: null }),
          insert: async (record: Record<string, unknown>) => {
            state.calls.push("insert")
            state.existing = { ...record, id: "booking", status: "pending" }
            return { error: null }
          },
          then: (resolve: (result: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: table === "plans" ? [state.plan] : table === "bookings" ? state.existing : table === "calendar_connections" ? state.connections.filter((connection) => !connectionId || connection.id === connectionId) : [], error: null }).then(resolve),
        }
        return chain
      },
      async rpc(name: string, parameters: Record<string, unknown>) {
        if (name === "transition_plan_status") {
          if (state.existing) return { data: null, error: { code: "P0001" } }
          state.plan.status = parameters.requested_status as string
          return { data: state.plan, error: null }
        }
        if (name === "reserve_calendar_booking") {
          state.calls.push("reserve")
          if (state.plan.status !== "collecting") return { data: null, error: { code: "P0001" } }
          state.existing ??= {
            plan_id: parameters.requested_plan_id, created_by: parameters.requested_user_id,
            idempotency_key: parameters.requested_idempotency_key,
            starts_at: parameters.requested_starts_at, ends_at: parameters.requested_ends_at,
            connection_id: parameters.requested_connection_id, provider_calendar_id: parameters.requested_calendar_id,
            id: "booking", status: "pending",
          }
          return { data: state.existing, error: null }
        }
        if (name === "save_guest_response") {
          state.responseParameters = parameters
          return { data: "response-id", error: null }
        }
        if (name === "replace_selected_calendars") { state.savedCalendars = parameters; return { data: null, error: null } }
        if (name === "accept_plan_invitation") return { data: [{ outcome: state.invitationOutcome, accepted_plan_id: state.plan.id }], error: null }
        if (name === "get_calendar_refresh_token") return { data: "refresh-token", error: null }
        if (name === "finalize_calendar_booking") {
          state.calls.push("finalize")
          if (state.finalizeFailure) return { data: null, error: { message: "database unavailable" } }
          state.existing = { ...state.existing, status: "created", provider_event_id: "event" }
          return { data: state.existing, error: null }
        }
        throw new Error("Unexpected RPC")
      },
    }
  }
  return { createAdminClient: client, createUserClient: client }
})
vi.mock("../calendar/google-oauth", () => ({ GoogleOAuthClient: class {
  async refresh() { state.calls.push("refresh"); return { access_token: "access-token" } }
} }))
vi.mock("../calendar/google", () => ({ GoogleCalendarProvider: class {
  async listCalendars() { return [{ id: "readonly", writable: false }, { id: "writable", writable: true }] }
  async findCreatedEvent() { state.calls.push("lookup"); return state.eventExists ? { id: "event" } : null }
  async createEvent(request: { calendarId: string }) {
    state.calls.push(`create:${request.calendarId}`)
    state.eventExists = true
    return { id: "event" }
  }
} }))
vi.mock("../services/plan-candidates", () => ({
  loadPlanCandidates: async () => {
    state.calls.push("recheck")
    if (state.cancelDuringRecheck) state.plan.status = "cancelled"
    return { plan: state.plan, candidates: state.available ? [{
      start: "2026-10-12T13:00:00Z", end: "2026-10-12T14:00:00Z", timeZone: "UTC",
      availableParticipantIds: ["private-host-id", "private-guest-id"], unavailableCount: 0, score: 1000,
    }] : [] }
  },
}))

function app() {
  const application = new Hono<AppEnvironment>()
  application.route("/v1/plans", bookings)
  application.route("/v1/plans", availability)
  application.route("/v1/plans", plans)
  application.route("/v1/plans", invitationManagement)
  application.route("/v1/plans", responses)
  application.route("/v1/calendar", calendars)
  application.route("/v1/invitations", invitationAccess)
  application.onError((error, context) => error instanceof HttpError
    ? context.json({ error: { message: error.message } }, error.status)
    : context.json({ error: { message: "Unexpected error" } }, 500))
  return application
}
function book(payload = input) {
  return app().request(`/v1/plans/${state.plan.id}/bookings`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  state.userId = state.plan.host_id
  state.plan.status = "collecting"
  state.existing = null
  state.available = true
  state.eventExists = false
  state.finalizeFailure = false
  state.calls = []
  state.invitationOutcome = "accepted"
  state.invitationStatus = "pending"
  state.activeMember = false
  state.response = null
  state.filters = []
  state.savedCalendars = null
  state.responseParameters = null
  state.cancelDuringRecheck = false
  state.connections = [{ id: "connection", granted_scopes: [], selected_calendars: [
    { provider_calendar_id: "readonly", is_primary: true }, { provider_calendar_id: "writable", is_primary: false },
  ] }]
})

describe("Worker workflow routes with provider and storage fakes", () => {
  it("can clear one account's calendars without disconnecting it", async () => {
    const response = await app().request(`/v1/calendar/connections/${state.plan.id}/calendars`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ calendarIds: [] }),
    })
    expect(response.status).toBe(200)
    expect(state.savedCalendars).toMatchObject({ calendar_ids: [], calendar_names: [], calendar_time_zones: [], calendar_primary_flags: [] })
  })

  it.each([{ selected_calendars: [] }, { selected_calendars: [{ provider_calendar_id: "readonly", is_primary: true }] }])("skips an account without selected writable calendars: %j", async ({ selected_calendars }) => {
    state.connections.unshift({ id: "other-connection", granted_scopes: [], selected_calendars })
    expect((await book()).status).toBe(201)
    expect(state.existing?.connection_id).toBe("connection")
    expect(state.calls.filter((call) => call.startsWith("create:"))).toEqual(["create:writable"])
  })

  it("does not change the original account or calendar when recovering a pending booking", async () => {
    state.connections.unshift({ id: "other-connection", granted_scopes: [], selected_calendars: [{ provider_calendar_id: "writable", is_primary: true }] })
    state.existing = { plan_id: state.plan.id, starts_at: input.startsAt, ends_at: input.endsAt, connection_id: "connection", provider_calendar_id: "readonly", status: "pending" }
    expect((await book()).status).toBe(409)
    expect(state.calls.filter((call) => call.startsWith("create:"))).toEqual([])
  })

  it("rejects reversed and oversized plan dates before database writes", async () => {
    const payload = { name: "Lunch", startDate: "2026-10-25", endDate: "2026-10-16", durationMinutes: 60, timeZone: "UTC", dayStart: "08:00", dayEnd: "22:00", quorum: 1 }
    for (const endDate of ["2026-10-16", "2027-01-01"]) {
      const response = await app().request("/v1/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, endDate }) })
      expect(response.status).toBe(400)
    }
    expect(state.calls).toEqual([])
  })
  it("returns a created booking on retry even when the plan is already booked", async () => {
    state.plan.status = "booked"
    state.existing = { plan_id: state.plan.id, starts_at: input.startsAt, ends_at: input.endsAt, status: "created" }
    expect((await book()).status).toBe(200)
    expect(state.calls).toEqual([])
  })

  it("rejects idempotency key reuse for a different moment", async () => {
    state.existing = { plan_id: state.plan.id, starts_at: input.startsAt, ends_at: input.endsAt, status: "created" }
    expect((await book({ ...input, endsAt: "2026-10-12T15:00:00Z" })).status).toBe(409)
    expect(state.calls).toEqual([])
  })

  it("requires host authorization before calling providers", async () => {
    state.userId = "55555555-5555-4555-8555-555555555555"
    expect((await book()).status).toBe(403)
    expect((await app().request(`/v1/plans/${state.plan.id}/people`)).status).toBe(403)
    expect((await app().request(`/v1/plans/${state.plan.id}/bookings`)).status).toBe(403)
    expect(state.calls).toEqual([])
  })

  it("lists only the authenticated host's plans", async () => {
    const result = await app().request("/v1/plans")
    expect(result.status).toBe(200)
    expect(state.filters).toContainEqual(["plans", "host_id", state.userId])
  })

  it("rejects self-invites, active members, and non-host invitations", async () => {
    function invite(email: string) {
      return app().request(`/v1/plans/${state.plan.id}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) })
    }
    expect((await invite("host@example.com")).status).toBe(409)
    state.activeMember = true
    expect((await invite("guest@example.com")).status).toBe(409)
    state.userId = "55555555-5555-4555-8555-555555555555"
    expect((await invite("guest@example.com")).status).toBe(403)
    expect(state.calls).toEqual([])
  })

  it("allows same-account invitation recovery but rejects removed members and email mismatches", async () => {
    state.invitationOutcome = "already_accepted"
    expect((await app().request("/v1/invitations/fake-token/accept", { method: "POST" })).status).toBe(200)
    state.invitationOutcome = "invalid"
    expect((await app().request("/v1/invitations/fake-token/accept", { method: "POST" })).status).toBe(409)
    state.invitationOutcome = "email_mismatch"
    expect((await app().request("/v1/invitations/fake-token/accept", { method: "POST" })).status).toBe(403)
  })

  it("does not expose a consumed invitation through its public preview", async () => {
    state.invitationStatus = "accepted"
    expect((await app().request("/v1/invitations/fake-token")).status).toBe(404)
  })

  it("returns only the authenticated user's saved choices", async () => {
    state.response = { submitted_at: input.startsAt, guest_response_slots: [{ starts_at: input.startsAt, ends_at: input.endsAt }] }
    const response = await app().request(`/v1/plans/${state.plan.id}/response`)
    expect(await response.json()).toEqual({ submittedAt: input.startsAt, slots: [{ startsAt: input.startsAt, endsAt: input.endsAt }] })
    expect(state.filters).toContainEqual(["guest_responses", "user_id", state.userId])
  })

  it("rechecks availability before inserting and creating an event in a writable calendar", async () => {
    expect((await book()).status).toBe(201)
    expect(state.calls).toEqual(["refresh", "recheck", "reserve", "create:writable", "finalize"])
  })

  it("does not create an event if cancellation wins the booking reservation race", async () => {
    state.cancelDuringRecheck = true
    expect((await book()).status).toBe(409)
    expect(state.calls).toEqual(["refresh", "recheck", "reserve"])
    expect(state.existing).toBeNull()
    expect(state.plan.status).toBe("cancelled")
  })

  it("rejects cancellation once a booking is pending", async () => {
    state.existing = { plan_id: state.plan.id, status: "pending" }
    const response = await app().request(`/v1/plans/${state.plan.id}/status`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "cancelled" }),
    })
    expect(response.status).toBe(409)
    expect(state.plan.status).toBe("collecting")
  })

  it("submits only verified candidates for the authenticated user through the privileged RPC", async () => {
    const request = (startsAt: string, endsAt: string) => app().request(`/v1/plans/${state.plan.id}/response`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ timeZone: "UTC", slots: [{ startsAt, endsAt }] }),
    })
    expect((await request("2026-10-12T15:00:00Z", "2026-10-12T16:00:00Z")).status).toBe(409)
    expect(state.responseParameters).toBeNull()
    expect((await request(input.startsAt, input.endsAt)).status).toBe(200)
    expect(state.responseParameters).toMatchObject({ response_plan_id: state.plan.id, response_user_id: state.userId, response_starts_at: [input.startsAt], response_ends_at: [input.endsAt] })
  })

  it("does not create an event after the final availability check fails", async () => {
    state.available = false
    expect((await book()).status).toBe(409)
    expect(state.calls).toEqual(["refresh", "recheck"])
  })

  it("reconciles an event created before database failure without a second event or stale recheck", async () => {
    state.finalizeFailure = true
    expect((await book()).status).toBe(500)
    state.finalizeFailure = false
    state.available = false
    expect((await book()).status).toBe(200)
    expect(state.calls.filter((call) => call.startsWith("create:"))).toEqual(["create:writable"])
    expect(state.calls.slice(-3)).toEqual(["refresh", "lookup", "finalize"])
  })

  it("returns aggregate counts without participant identifiers", async () => {
    const response = await app().request(`/v1/plans/${state.plan.id}/candidates`, { method: "POST" })
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).toContain('"availableCount":2')
    expect(body).not.toContain("availableParticipantIds")
    expect(body).not.toContain("private-host-id")
    expect(body).not.toContain("private-guest-id")
  })
})
