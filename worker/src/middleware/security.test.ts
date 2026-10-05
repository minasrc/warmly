import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppEnvironment } from "../context"
import { globalRateLimit, rateLimitBucket } from "./rate-limit"
import { securityHeaders } from "./security"
import { safeRequestPath } from "./request-context"

const database = vi.hoisted(() => ({ rpc: vi.fn(async (_name: string, _parameters: unknown) => ({ data: true, error: null })) }))
vi.mock("../supabase", () => ({ createAdminClient: () => database }))
beforeEach(() => database.rpc.mockClear())

describe("API protection", () => {
  it("sets privacy and browser hardening headers", async () => {
    const app = new Hono<AppEnvironment>()
    app.use("*", securityHeaders)
    app.get("/", (context) => context.json({ ok: true }))
    const response = await app.request("/", {}, { APP_ENV: "production" } as AppEnvironment["Bindings"])
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("does not persist a raw rate-limit identity", async () => {
    const bucket = await rateLimitBucket("global-v1", "203.0.113.5")
    expect(bucket).toMatch(/^[a-f0-9]{64}$/)
    expect(bucket).not.toContain("203.0.113.5")
  })

  it("ignores client-controlled forwarded addresses when the edge address is absent", async () => {
    const app = new Hono<AppEnvironment>()
    app.use("*", globalRateLimit)
    app.get("/", (context) => context.json({ ok: true }))
    for (const address of ["203.0.113.1", "203.0.113.2"]) {
      expect((await app.request("/", { headers: { "x-forwarded-for": address } })).status).toBe(200)
    }
    const parameters = { requested_bucket_key: await rateLimitBucket("global-v1", "local"), maximum_requests: 300, window_seconds: 300 }
    expect(database.rpc).toHaveBeenNthCalledWith(1, "consume_api_rate_limit", parameters)
    expect(database.rpc).toHaveBeenNthCalledWith(2, "consume_api_rate_limit", parameters)
  })

  it("uses Cloudflare's edge address instead of forwarded headers", async () => {
    const app = new Hono<AppEnvironment>()
    app.use("*", globalRateLimit)
    app.get("/", (context) => context.json({ ok: true }))
    await app.request("/", { headers: { "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "spoofed" } })
    expect(database.rpc).toHaveBeenCalledWith("consume_api_rate_limit", expect.objectContaining({ requested_bucket_key: await rateLimitBucket("global-v1", "203.0.113.5") }))
  })

  it("redacts invitation secrets from request paths", () => {
    expect(safeRequestPath("/v1/invitations/private-token/accept")).toBe("/v1/invitations/[redacted]/accept")
    expect(safeRequestPath("/v1/plans/plan-id/invitations")).toBe("/v1/plans/plan-id/invitations")
  })
})
