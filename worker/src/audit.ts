import type { Bindings } from "./env"
import { createAdminClient } from "./supabase"

type AuditMetadata = Record<string, boolean | number | string | null>

export async function writeAuditEvent(
  environment: Bindings,
  event: {
    action: string
    actorId: string
    requestId: string
    planId?: string
    metadata?: AuditMetadata
  },
) {
  const admin = createAdminClient(environment)
  const { error } = await admin.from("audit_log").insert({
    action: event.action,
    actor_id: event.actorId,
    plan_id: event.planId,
    request_id: event.requestId,
    metadata: event.metadata ?? {},
  })
  if (error) {
    console.error(JSON.stringify({
      requestId: event.requestId,
      error: "audit_write_failed",
      action: event.action,
    }))
  }
}
