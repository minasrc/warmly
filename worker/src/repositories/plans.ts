import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpError } from "../http-error"

export type CreatePlanRecord = {
  host_id: string
  name: string
  start_date: string
  end_date: string
  duration_minutes: number
  time_zone: string
  day_start: string
  day_end: string
  quorum: number
  increment_minutes: number
  allowed_dayparts: string[]
  require_all: boolean
}

export class PlanRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(plan: CreatePlanRecord) {
    const { data, error } = await this.client.from("plans").insert(plan).select().single()
    if (error) throw new HttpError(422, "bad_request", "Plan could not be created")
    return data
  }

  async find(planId: string) {
    const { data, error } = await this.client.from("plans").select().eq("id", planId).maybeSingle()
    if (error) throw new HttpError(500, "internal_error", "Plan could not be loaded")
    if (!data) throw new HttpError(404, "not_found", "Plan not found")
    return data
  }
}
