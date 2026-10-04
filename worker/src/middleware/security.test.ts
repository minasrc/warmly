import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import type { AppEnvironment } from "../context"
import { rateLimitBucket } from "./rate-limit"
import { securityHeaders } from "./security"

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
})
