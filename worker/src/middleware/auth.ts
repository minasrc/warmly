import { createClient } from "@supabase/supabase-js"
import { createMiddleware } from "hono/factory"
import type { AppEnvironment } from "../context"
import { parseEnvironment } from "../env"
import { HttpError } from "../http-error"

export const requireUser = createMiddleware<AppEnvironment>(async (context, next) => {
  const authorization = context.req.header("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "unauthorized", "Authentication is required")
  }

  const environment = parseEnvironment(context.env)
  const supabase = createClient(environment.SUPABASE_URL, environment.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(authorization.slice(7))
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Session is invalid or expired")
  context.set("user", data.user)
  await next()
})
