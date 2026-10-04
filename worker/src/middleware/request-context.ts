import { createMiddleware } from "hono/factory"
import type { AppEnvironment } from "../context"

export const requestContext = createMiddleware<AppEnvironment>(async (context, next) => {
  const requestId = context.req.header("x-request-id") || crypto.randomUUID()
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
