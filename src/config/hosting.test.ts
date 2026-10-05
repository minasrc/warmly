import { describe, expect, it } from "vitest"
import { frontendHeaders } from "./hosting"

describe("frontend hosting headers", () => {
  it("limits connections to configured origins without exposing paths, keys, or userinfo", () => {
    const headers = frontendHeaders({ VITE_API_URL: "https://api.example.com/private-path", VITE_SUPABASE_URL: "https://db.example.com", VITE_SUPABASE_PUBLISHABLE_KEY: "never-emit-a-key" })
    expect(headers).toContain("connect-src 'self' https://api.example.com https://db.example.com wss://db.example.com")
    expect(headers).toContain("Referrer-Policy: no-referrer")
    expect(headers).toContain("script-src 'self'")
    expect(headers).not.toContain("private-path")
    expect(headers).not.toContain("never-emit-a-key")
    expect(() => frontendHeaders({ VITE_API_URL: "https://user:password@example.com" })).toThrow("Invalid frontend service URL")
    expect(() => frontendHeaders({ VITE_API_URL: "javascript:alert(1)" })).toThrow("Invalid frontend service URL")
  })
})
