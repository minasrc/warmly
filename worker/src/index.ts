import { Hono } from "hono"
import { cors } from "hono/cors"
import type { ApiError } from "@warmly/domain"
import type { AppEnvironment } from "./context"
import { parseEnvironment } from "./env"
import { HttpError } from "./http-error"
import { requireUser } from "./middleware/auth"
import { requestContext } from "./middleware/request-context"

const app = new Hono<AppEnvironment>()

app.use("*", requestContext)
app.use("*", async (context, next) => {
  const environment = parseEnvironment(context.env)
  return cors({
    origin: environment.FRONTEND_URL,
    allowHeaders: ["authorization", "content-type", "x-request-id"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400,
  })(context, next)
})

app.get("/health", (context) => context.json({
  status: "ok",
  environment: context.env.APP_ENV,
  requestId: context.get("requestId"),
}))

app.get("/v1/me", requireUser, (context) => {
  const user = context.get("user")
  return context.json({ id: user.id, email: user.email ?? null })
})

app.notFound(() => {
  throw new HttpError(404, "not_found", "Route not found")
})

app.onError((error, context) => {
  const requestId = context.get("requestId") || crypto.randomUUID()
  const known = error instanceof HttpError
  const status = known ? error.status : 500
  const body: ApiError = {
    error: {
      code: known ? error.code : "internal_error",
      message: known ? error.message : "An unexpected error occurred",
      requestId,
    },
  }
  if (!known) console.error(JSON.stringify({ requestId, error: error.name }))
  return context.json(body, status)
})

export default app
