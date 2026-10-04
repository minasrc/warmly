import { createMiddleware } from "hono/factory"
import type { AppEnvironment } from "../context"

export const requestContext = createMiddleware<AppEnvironment>(async (context, next) => {
  const suppliedRequestId = context.req.header("x-request-id")
  const requestId = suppliedRequestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID()
  const startedAt = Date.now()
  context.set("requestId", requestId)
  context.header("x-request-id", requestId)

  try {
    await next()
  } finally {
    console.log(JSON.stringify({
      requestId,
      method: context.req.method,
      path: new URL(context.req.url).pathname,
      status: context.res.status,
      durationMs: Date.now() - startedAt,
    }))
  }
})
