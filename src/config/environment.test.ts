import { describe, expect, it } from "vitest"
import { appMode, assertLiveBuildEnvironment, assertPublicBuildEnvironment, parsePublicEnvironment } from "./environment"

const environment = {
  VITE_API_URL: "https://api.warmly.test",
  VITE_SUPABASE_URL: "https://db.warmly.test",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only_1234567890",
}

function legacyKey(role: string) {
  return `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ role }))}.fixture-signature`
}

describe("public configuration", () => {
  it.each([environment.VITE_SUPABASE_PUBLISHABLE_KEY, legacyKey("anon")])("accepts publishable and legacy anon keys", (key) => {
    expect(parsePublicEnvironment({ ...environment, VITE_SUPABASE_PUBLISHABLE_KEY: key }).supabasePublishableKey).toBe(key)
  })

  it.each(["sb_secret_do_not_expose_1234567890", legacyKey("service_role"), legacyKey("authenticated"), "not-a-valid-key-1234567890", "bad.invalid.signature"])('rejects non-public keys without printing their value', (key) => {
    expect(() => parsePublicEnvironment({ ...environment, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow("Invalid public environment: VITE_SUPABASE_PUBLISHABLE_KEY")
    try {
      parsePublicEnvironment({ ...environment, VITE_SUPABASE_PUBLISHABLE_KEY: key })
    } catch (error) {
      expect((error as Error).message).not.toContain(key)
    }
  })

  it.each(["invalid", "ftp://api.warmly.test", "https://user:password@api.warmly.test", "https://api.warmly.test/path", "https://api.warmly.test?secret=value", "https://api.warmly.test#fragment"])('rejects service URLs that are not plain HTTP origins', (url) => {
    expect(() => parsePublicEnvironment({ ...environment, VITE_API_URL: url })).toThrow("Invalid public environment: VITE_API_URL")
  })

  it("allows local HTTP origins during development", () => {
    expect(parsePublicEnvironment({ ...environment, VITE_API_URL: "http://localhost:8787", VITE_SUPABASE_URL: "http://127.0.0.1:54321" }).apiUrl).toBe("http://localhost:8787")
  })

  it("keeps normal builds usable without live accounts", () => {
    expect(() => assertPublicBuildEnvironment({})).not.toThrow()
    expect(() => assertPublicBuildEnvironment({ VITE_APP_MODE: "preview" })).not.toThrow()
  })

  it.each(["VITE_SUPABASE_SERVICE_ROLE_KEY", "VITE_GOOGLE_CLIENT_SECRET", "VITE_UNREVIEWED_SETTING"])('blocks unapproved VITE fields before bundling', (key) => {
    expect(() => assertPublicBuildEnvironment({ ...environment, [key]: "do-not-print-this-value" })).toThrow(`Unapproved public environment fields: ${key}`)
  })

  it("also rejects a server key in preview builds", () => {
    expect(() => assertPublicBuildEnvironment({ ...environment, VITE_APP_MODE: "preview", VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey("service_role") })).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY")
  })
})

describe("live builds", () => {
  it("requires complete remote HTTPS configuration", () => {
    expect(() => assertLiveBuildEnvironment({})).toThrow("Invalid public environment")
    expect(assertLiveBuildEnvironment(environment).apiUrl).toBe(environment.VITE_API_URL)
  })

  it.each(["http://api.warmly.test", "https://localhost", "https://localhost.", "https://127.0.0.1", "https://127.1", "https://[::1]", "https://[::]", "https://[::ffff:127.0.0.1]", "https://test.localhost", "https://0.0.0.0"])('rejects HTTP and loopback services', (url) => {
    expect(() => assertLiveBuildEnvironment({ ...environment, VITE_API_URL: url })).toThrow("remote HTTPS origin for VITE_API_URL")
    expect(() => assertLiveBuildEnvironment({ ...environment, VITE_SUPABASE_URL: url })).toThrow("remote HTTPS origin for VITE_SUPABASE_URL")
  })

  it("does not permit preview fixtures in a release", () => {
    expect(() => assertLiveBuildEnvironment({ ...environment, VITE_APP_MODE: "preview" })).toThrow("Live builds cannot use design-preview mode")
  })

  it("keeps mode defaults explicit", () => {
    expect(appMode({ PROD: true })).toBe("live")
    expect(appMode({ PROD: false })).toBe("preview")
    expect(() => appMode({ VITE_APP_MODE: "invalid" })).toThrow("VITE_APP_MODE must be live or preview")
  })
})
