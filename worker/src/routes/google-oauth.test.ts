import { Hono, type Context } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppEnvironment } from "../context"
import { HttpError } from "../http-error"
import { googleOAuth } from "./google-oauth"

const state = vi.hoisted(() => ({
  owner: "11111111-1111-4111-8111-111111111111", userId: "", consumed: false, expired: false,
  calls: [] as string[], saved: null as Record<string, unknown> | null,
}))
const oauthState = "a".repeat(43)
vi.mock("../middleware/auth", () => ({ requireUser: async (context: Context<AppEnvironment>, next: () => Promise<void>) => {
  if (!context.req.header("authorization")) throw new HttpError(401, "unauthorized", "Authentication is required")
  context.set("user", { id: state.userId, email: "host@example.com" } as AppEnvironment["Variables"]["user"])
  await next()
} }))
vi.mock("../env", () => ({ parseEnvironment: () => ({
  FRONTEND_URL: "https://warmly.test", GOOGLE_CLIENT_ID: "fake", GOOGLE_CLIENT_SECRET: "fake", GOOGLE_REDIRECT_URI: "https://api.warmly.test/v1/calendar/google/callback",
}) }))
vi.mock("../audit", () => ({ writeAuditEvent: async () => {} }))
vi.mock("../supabase", () => ({ createAdminClient: () => ({
  async rpc(name: string, parameters: Record<string, unknown>) {
    state.calls.push(name)
    if (name === "consume_oauth_state") {
      if (parameters.requested_user_id !== state.owner || state.consumed || state.expired) return { data: [], error: null }
      state.consumed = true
      return { data: [{ oauth_user_id: state.owner, oauth_code_verifier: "server-pkce", oauth_redirect_uri: "https://api.warmly.test/v1/calendar/google/callback" }], error: null }
    }
    if (name === "save_google_calendar_connection") { state.saved = parameters; return { data: "connection", error: null } }
    throw new Error("Unexpected RPC")
  },
}) }))
vi.mock("../calendar/google-oauth", () => ({ GoogleOAuthClient: class {
  async exchangeCode(code: string, verifier: string, redirect: string) {
    expect(code).toBe("provider-code")
    expect(verifier).toBe("server-pkce")
    expect(redirect).toBe("https://api.warmly.test/v1/calendar/google/callback")
    state.calls.push("exchange")
    return { access_token: "private-access-token", refresh_token: "private-refresh-token", scope: "calendar-scope" }
  }
  async identity() { return { sub: "different-google-account", email: "calendar@another-account.test" } }
} }))

function app() {
  const app = new Hono<AppEnvironment>()
  app.route("/google", googleOAuth)
  app.onError((error, context) => error instanceof HttpError ? context.json({ error: error.message }, error.status) : context.json({ error: "Unexpected error" }, 500))
  return app
}
function complete(authenticated = true) {
  return app().request("/google/complete", {
    method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: "Bearer user-token" } : {}) },
    body: JSON.stringify({ state: oauthState, code: "provider-code" }),
  })
}
beforeEach(() => { state.userId = state.owner; state.consumed = false; state.expired = false; state.calls = []; state.saved = null })

describe("calendar OAuth session binding", () => {
  it("the public callback only returns to the frontend, never exchanges or stores grants", async () => {
    const response = await app().request(`/google/callback?state=${oauthState}&code=provider-code`)
    expect(response.status).toBe(303)
    expect(new URL(response.headers.get("location")!).origin).toBe("https://warmly.test")
    const redirect = new URL(response.headers.get("location")!)
    expect(redirect.search).toBe("")
    expect(new URLSearchParams(redirect.hash.slice(1)).get("code")).toBe("provider-code")
    expect(state.calls).toEqual([])
    expect(state.saved).toBeNull()
  })
  it("requires authentication before consuming state", async () => {
    expect((await complete(false)).status).toBe(401)
    expect(state.calls).toEqual([])
  })
  it("rejects another Warmly session without burning the owner's state", async () => {
    state.userId = "22222222-2222-4222-8222-222222222222"
    expect((await complete()).status).toBe(400)
    expect(state.calls).toEqual(["consume_oauth_state"])
    expect(state.consumed).toBe(false)
    expect(state.saved).toBeNull()
    state.userId = state.owner
    expect((await complete()).status).toBe(200)
  })
  it("allows a different Google account only for the initiating authenticated Warmly user", async () => {
    const response = await complete()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ connected: true })
    expect(state.saved).toMatchObject({ connection_user_id: state.owner, google_account_id: "different-google-account", google_account_email: "calendar@another-account.test" })
    expect(state.calls).toEqual(["consume_oauth_state", "exchange", "save_google_calendar_connection"])
  })
  it("rejects replay without exchanging the code twice", async () => {
    expect((await complete()).status).toBe(200)
    expect((await complete()).status).toBe(400)
    expect(state.calls.filter((call) => call === "exchange")).toHaveLength(1)
  })
  it("rejects expired state without requesting provider tokens", async () => {
    state.expired = true
    expect((await complete()).status).toBe(400)
    expect(state.calls).toEqual(["consume_oauth_state"])
  })
})
