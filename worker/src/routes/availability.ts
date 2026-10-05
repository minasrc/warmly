import { Hono } from "hono"
import type { AppEnvironment } from "../context"
import { requireUser } from "../middleware/auth"
import { loadPlanCandidates } from "../services/plan-candidates"
import { parseId } from "../validation"

export const availability = new Hono<AppEnvironment>()
availability.use("*", requireUser)

availability.post("/:planId/candidates", async (context) => {
  const planId = parseId(context.req.param("planId"))
  const { candidates } = await loadPlanCandidates(context.env, context.get("accessToken"), planId)
  return context.json({
    candidates: candidates.map(({ availableParticipantIds, ...candidate }) => ({
      ...candidate,
      availableCount: availableParticipantIds.length,
    })),
  })
})
