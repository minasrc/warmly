import type { User } from "@supabase/supabase-js"
import type { Bindings } from "./env"

export type Variables = {
  requestId: string
  user: User
}

export type AppEnvironment = {
  Bindings: Bindings
  Variables: Variables
}
