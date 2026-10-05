import { HttpError } from "../http-error"

export async function providerFetch(fetcher: typeof fetch, input: RequestInfo | URL, init: RequestInit = {}) {
  try {
    return await fetcher(input, { ...init, signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new HttpError(502, "provider_error", "The calendar provider is temporarily unavailable")
  }
}
