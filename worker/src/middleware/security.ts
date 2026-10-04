import { createMiddleware } from "hono/factory"
import type { AppEnvironment } from "../context"

export const securityHeaders = createMiddleware<AppEnvironment>(async (context, next) => {
  await next()
  context.header("cache-control", "no-store")
  context.header("content-security-policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
  context.header("cross-origin-opener-policy", "same-origin")
  context.header("cross-origin-resource-policy", "cross-origin")
  context.header("permissions-policy", "camera=(), microphone=(), geolocation=()")
  context.header("referrer-policy", "no-referrer")
  context.header("x-content-type-options", "nosniff")
  if (context.env.APP_ENV === "production") {
    context.header("strict-transport-security", "max-age=31536000; includeSubDomains")
  }
})
