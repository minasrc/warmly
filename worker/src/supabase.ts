import { createClient } from "@supabase/supabase-js"
import type { Bindings } from "./env"
import { parseEnvironment } from "./env"

export function createUserClient(bindings: Bindings, accessToken: string) {
  const environment = parseEnvironment(bindings)
  return createClient(environment.SUPABASE_URL, environment.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { authorization: `Bearer ${accessToken}` } },
  })
}

export function createAdminClient(bindings: Bindings) {
  const environment = parseEnvironment(bindings)
  return createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
