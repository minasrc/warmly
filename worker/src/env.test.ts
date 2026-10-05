import { describe, expect, it } from "vitest"
import { parseEnvironment, type Bindings } from "./env"

const environment: Bindings = {
  APP_ENV: "production",
  FRONTEND_URL: "https://warmly.test",
  SUPABASE_URL: "https://db.warmly.test",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only_1234567890",
  SUPABASE_SERVICE_ROLE_KEY: "server-fixture-only-1234567890",
  GOOGLE_CLIENT_ID: "google-client-fixture",
  GOOGLE_CLIENT_SECRET: "google-secret-fixture",
  GOOGLE_REDIRECT_URI: "https://api.warmly.test/v1/calendar/google/callback",
}

describe("Worker configuration", () => {
  it("accepts a deployed HTTPS configuration and normalizes the CORS origin", () => {
    expect(parseEnvironment({ ...environment, FRONTEND_URL: "https://warmly.test/" }).FRONTEND_URL).toBe("https://warmly.test")
  })

  it("allows local HTTP development without live accounts", () => {
    expect(() => parseEnvironment({ ...environment, APP_ENV: "development", FRONTEND_URL: "http://localhost:5173", SUPABASE_URL: "http://127.0.0.1:54321", GOOGLE_REDIRECT_URI: "http://localhost:8787/v1/calendar/google/callback" })).not.toThrow()
  })

  for (const mode of ["preview", "production"]) {
    for (const key of ["FRONTEND_URL", "SUPABASE_URL", "GOOGLE_REDIRECT_URI"] as const) {
      it.each(["http://api.warmly.test", "https://localhost", "https://localhost.", "https://127.0.0.1", "https://[::1]", "https://[::]", "https://[::ffff:127.0.0.1]", "https://test.localhost", "https://0.0.0.0"])(`rejects an unsafe ${key} in ${mode}`, (origin) => {
        const url = key === "GOOGLE_REDIRECT_URI" ? `${origin}/v1/calendar/google/callback` : origin
        expect(() => parseEnvironment({ ...environment, APP_ENV: mode, [key]: url })).toThrow()
      })
    }
  }

  it.each(["invalid", "file:///tmp/warmly", "ftp://api.warmly.test", "https://user:password@api.warmly.test", "https://api.warmly.test?code=private", "https://api.warmly.test#fragment"])("rejects malformed or credential-bearing URLs", (url) => {
    for (const key of ["FRONTEND_URL", "SUPABASE_URL", "GOOGLE_REDIRECT_URI"] as const) {
      expect(() => parseEnvironment({ ...environment, [key]: url })).toThrow()
    }
  })

  it("requires origins for frontend/database services and the exact Google callback path", () => {
    expect(() => parseEnvironment({ ...environment, FRONTEND_URL: "https://warmly.test/app" })).toThrow()
    expect(() => parseEnvironment({ ...environment, SUPABASE_URL: "https://db.warmly.test/rest/v1" })).toThrow()
    expect(() => parseEnvironment({ ...environment, GOOGLE_REDIRECT_URI: "https://api.warmly.test/wrong-callback" })).toThrow()
  })
})
