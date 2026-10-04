import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiClient, ApiClientError } from "./api-client"
import { anonymousSession } from "./auth-session"

afterEach(() => vi.unstubAllGlobals())

describe("ApiClient", () => {
  it("invokes the default fetch with its global receiver", async () => {
    const nativeFetch = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis)
      return Promise.resolve(Response.json({ connections: [] }))
    })
    vi.stubGlobal("fetch", nativeFetch)
    const client = new ApiClient("https://api.example.com", anonymousSession)
    await expect(client.listCalendarConnections()).resolves.toEqual({ connections: [] })
    expect(nativeFetch).toHaveBeenCalledOnce()
  })

  it("handles unreadable responses without exposing their body", async () => {
    const fetcher = vi.fn(async () => new Response("private diagnostic", {
      status: 502,
      headers: { "x-request-id": "request-1" },
    }))
    const client = new ApiClient("https://api.example.com", anonymousSession, fetcher)
    await expect(client.listPlans()).rejects.toEqual(
      new ApiClientError(502, "internal_error", "request-1", "The server returned an unreadable response"),
    )
  })

  it("adds the current bearer token without exposing it in returned data", async () => {
    const fetcher = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get("authorization")).toBe("Bearer private-token")
      expect(headers.get("x-request-id")).toBeTruthy()
      return new Response(JSON.stringify({ id: "user-1", email: "friend@example.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })
    const client = new ApiClient("https://api.example.com", {
      getAccessToken: async () => "private-token",
    }, fetcher as typeof fetch)

    await expect(client.getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "friend@example.com",
    })
  })

  it("turns structured API failures into typed errors", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "unauthorized", message: "Authentication is required", requestId: "request-1" },
    }), { status: 401, headers: { "content-type": "application/json" } }))
    const client = new ApiClient("https://api.example.com", {
      getAccessToken: async () => null,
    }, fetcher as typeof fetch)

    await expect(client.getCurrentUser()).rejects.toEqual(
      new ApiClientError(401, "unauthorized", "request-1", "Authentication is required"),
    )
  })

  it("supports empty successful responses when disconnecting a calendar", async () => {
    const fetcher = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      new Response(null, { status: 204 }))
    const client = new ApiClient("https://api.example.com", {
      getAccessToken: async () => "private-token",
    }, fetcher as typeof fetch)
    await expect(client.disconnectCalendar("connection-1")).resolves.toBeUndefined()
    const [, init] = fetcher.mock.calls[0] ?? []
    expect(init?.method).toBe("DELETE")
  })
})
