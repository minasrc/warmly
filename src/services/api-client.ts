import type { ApiError } from "@warmly/domain"
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
