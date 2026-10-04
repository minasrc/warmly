import { describe, expect, it, vi } from "vitest"
import { GoogleOAuthClient } from "./google-oauth"

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://api.example.com/callback",
}

describe("GoogleOAuthClient", () => {
  it("builds a read-only offline PKCE authorization request", () => {
    const url = new URL(new GoogleOAuthClient(config).authorizationUrl("state", "challenge", "availability"))
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("scope")).toContain("calendar.calendarlist.readonly")
    expect(url.searchParams.get("scope")).toContain("calendar.freebusy")
    expect(url.searchParams.get("scope")).not.toContain("/auth/calendar.readonly")
    expect(url.searchParams.get("scope")).not.toContain("calendar.events")
  })

  it("requests event access separately for booking", () => {
    const url = new URL(new GoogleOAuthClient(config).authorizationUrl("state", "challenge", "booking"))
    expect(url.searchParams.get("scope")).toContain("calendar.events")
    expect(url.searchParams.get("scope")).not.toContain("calendar.readonly")
  })

  it("exchanges a code without putting credentials in the URL", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: "openid email",
      token_type: "Bearer",
    }))
    const client = new GoogleOAuthClient(config, fetcher as typeof fetch)
    await client.exchangeCode("private-code", "private-verifier", config.redirectUri)

    const [input, init] = fetcher.mock.calls[0] ?? []
    expect(input).toBe("https://oauth2.googleapis.com/token")
    const body = init?.body as URLSearchParams
    expect(body.get("code")).toBe("private-code")
    expect(body.get("code_verifier")).toBe("private-verifier")
  })

  it("revokes a refresh token in a form body", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null))
    const client = new GoogleOAuthClient(config, fetcher as typeof fetch)
    await client.revoke("refresh-token")

    const [input, init] = fetcher.mock.calls[0] ?? []
    expect(input).toBe("https://oauth2.googleapis.com/revoke")
    expect(init?.method).toBe("POST")
    const body = init?.body
    expect(body).toBeInstanceOf(URLSearchParams)
    expect((body as URLSearchParams).get("token")).toBe("refresh-token")
  })

  it("treats an already-invalid token as successfully revoked", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 400 }))
    await expect(new GoogleOAuthClient(config, fetcher as typeof fetch).revoke("expired")).resolves.toBeUndefined()
  })
})
