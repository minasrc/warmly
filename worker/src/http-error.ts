import type { ApiErrorCode } from "@warmly/domain"

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
  }
}
