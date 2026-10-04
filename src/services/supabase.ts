import { createClient } from "@supabase/supabase-js"
import { getPublicEnvironment } from "@/config/environment"
import type { AuthSession } from "./auth-session"

let client: ReturnType<typeof createClient> | undefined

export function getSupabaseClient() {
  if (client) return client
  const environment = getPublicEnvironment()
  client = createClient(environment.supabaseUrl, environment.supabasePublishableKey)
  return client
}

export const supabaseSession: AuthSession = {
  async getAccessToken() {
    const { data } = await getSupabaseClient().auth.getSession()
    return data.session?.access_token ?? null
  },
}
