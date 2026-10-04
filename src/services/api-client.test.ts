import { describe, expect, it, vi } from "vitest"
import { ApiClient, ApiClientError } from "./api-client"

describe("ApiClient", () => {
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
