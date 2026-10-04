import type { ApiError, CandidateSlot } from "@warmly/domain"
import type { AuthSession } from "./auth-session"

type Fetcher = typeof fetch

export class ApiClientError extends Error {
  readonly status: number
  readonly code: ApiError["error"]["code"]
  readonly requestId: string

  constructor(
    status: number,
    code: ApiError["error"]["code"],
    requestId: string,
    message: string,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

export class ApiClient {
  private readonly apiUrl: string
  private readonly session: AuthSession
  private readonly fetcher: Fetcher

  constructor(
    apiUrl: string,
    session: AuthSession,
    fetcher: Fetcher = fetch,
  ) {
    this.apiUrl = apiUrl
    this.session = session
    this.fetcher = fetcher
  }

  async getCurrentUser() {
    return this.request<{ id: string; email: string | null }>("/v1/me")
  }

  async createPlan(input: {
    name: string
    startDate: string
    endDate: string
    durationMinutes: number
    timeZone: string
    dayStart: string
    dayEnd: string
    quorum: number
    incrementMinutes?: number
  }) {
    return this.request<{ plan: { id: string } }>("/v1/plans", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  async createInvitation(planId: string, email: string) {
    return this.request<{ invitation: { id: string; expires_at: string }; inviteUrl: string }>(
      `/v1/plans/${planId}/invitations`,
      { method: "POST", body: JSON.stringify({ email }) },
    )
  }

  async openPlan(planId: string) {
    return this.request<{ plan: { id: string; status: string } }>(`/v1/plans/${planId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "collecting" }),
    })
  }

  async previewInvitation(token: string) {
    return this.request<{ plan: { id: string; name: string } }>(`/v1/invitations/${token}`)
  }

  async acceptInvitation(token: string) {
    return this.request<{ planId: string }>(`/v1/invitations/${token}/accept`, { method: "POST" })
  }

  async beginGoogleAuthorization(access: "availability" | "booking" = "availability") {
    return this.request<{ authorizationUrl: string }>(
      `/v1/calendar/google/authorize?access=${access}`,
      { method: "POST" },
    )
  }

  async listCalendarConnections() {
    return this.request<{ connections: unknown[] }>("/v1/calendar/connections")
  }

  async listProviderCalendars(connectionId: string) {
    return this.request<{ calendars: Array<{ id: string; name: string; primary: boolean }> }>(
      `/v1/calendar/connections/${connectionId}/calendars`,
    )
  }

  async selectCalendars(connectionId: string, calendarIds: string[]) {
    return this.request<{ calendars: Array<{ id: string; name: string; primary: boolean }> }>(
      `/v1/calendar/connections/${connectionId}/calendars`,
      { method: "PUT", body: JSON.stringify({ calendarIds }) },
    )
  }

  async getCandidateMoments(planId: string) {
    return this.request<{ candidates: CandidateSlot[] }>(`/v1/plans/${planId}/candidates`, {
      method: "POST",
    })
  }

  async saveMomentChoices(planId: string, input: {
    timeZone: string
    slots: Array<{ startsAt: string; endsAt: string }>
  }) {
    return this.request<{ responseId: string; selectedCount: number }>(`/v1/plans/${planId}/response`, {
      method: "PUT",
      body: JSON.stringify(input),
    })
  }

  async getResponseSummary(planId: string) {
    return this.request<{
      moments: Array<{ startsAt: string; endsAt: string; responseCount: number }>
    }>(`/v1/plans/${planId}/response-summary`)
  }

  async createBooking(planId: string, input: {
    startsAt: string
    endsAt: string
    idempotencyKey: string
  }) {
    return this.request<{ booking: { id: string; status: string } }>(`/v1/plans/${planId}/bookings`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.session.getAccessToken()
    const headers = new Headers(init.headers)
    headers.set("accept", "application/json")
    headers.set("x-request-id", crypto.randomUUID())
    if (init.body) headers.set("content-type", "application/json")
    if (token) headers.set("authorization", `Bearer ${token}`)

    const response = await this.fetcher(new URL(path, this.apiUrl), { ...init, headers })
    if (!response.ok) {
      const fallbackRequestId = response.headers.get("x-request-id") ?? "unknown"
      const payload = await readApiError(response, fallbackRequestId)
      throw new ApiClientError(response.status, payload.error.code, payload.error.requestId, payload.error.message)
    }
    return response.json() as Promise<T>
  }
}

async function readApiError(response: Response, requestId: string): Promise<ApiError> {
  try {
    return await response.json() as ApiError
  } catch {
    return {
      error: {
        code: "internal_error",
        message: "The server returned an unreadable response",
        requestId,
      },
    }
  }
}
