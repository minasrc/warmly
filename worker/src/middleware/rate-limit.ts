import { createMiddleware } from "hono/factory"
import type { AppEnvironment } from "../context"
import { HttpError } from "../http-error"
import { createAdminClient } from "../supabase"

function hexadecimal(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("")
}

export async function rateLimitBucket(namespace: string, identity: string) {
  const value = new TextEncoder().encode(`${namespace}:${identity}`)
  return hexadecimal(await crypto.subtle.digest("SHA-256", value))
}

export const globalRateLimit = createMiddleware<AppEnvironment>(async (context, next) => {
  if (context.req.method === "OPTIONS") return next()
  const address = context.req.header("cf-connecting-ip")
    ?? "local"
  const bucket = await rateLimitBucket("global-v1", address)
  const admin = createAdminClient(context.env)
  const { data: allowed, error } = await admin.rpc("consume_api_rate_limit", {
    requested_bucket_key: bucket,
    maximum_requests: 300,
    window_seconds: 300,
  })
  if (error) throw new HttpError(503, "temporarily_unavailable", "Request protection is unavailable")
  if (!allowed) throw new HttpError(429, "rate_limited", "Too many requests")
  await next()
})
