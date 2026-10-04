import { useEffect, useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import type { InvitationSummary } from "@/services/api-types"
import { ApiClientError } from "@/services/api-client"
import type { ProductionController } from "@/services/production-controller"
import { CalendarSelection } from "./calendar-selection"
import { choiceSlots, momentViews, responseState } from "./flow-mapping"
import { GuestFlow } from "./guest-flow"
import { Shell } from "./host-flow"
import { useLiveIdentity, useRequest } from "./live-hooks"
import type { MomentView } from "./model"

const guestStateSchema = z.object({ planId: z.uuid(), userId: z.uuid(), hostName: z.string() })

function readGuestState(token: string, userId?: string) {
  try {
    const parsed = guestStateSchema.safeParse(JSON.parse(sessionStorage.getItem(`warmly:guest:${token}`) ?? "null"))
    return parsed.success && parsed.data.userId === userId ? parsed.data : null
  } catch { return null }
}

export function LiveGuestFlow({ controller, token }: { controller: ProductionController; token: string }) {
  const { identity, ready, error: authError } = useLiveIdentity(controller)
  const identityId = identity?.id
  const { busy, error, run } = useRequest()
  const [bootKey, setBootKey] = useState("")
  const [bootError, setBootError] = useState("")
  const [summary, setSummary] = useState<InvitationSummary | null>(null)
  const [stage, setStage] = useState<"invite" | "calendar" | "moments" | "closed">("invite")
  const [planId, setPlanId] = useState("")
  const [moments, setMoments] = useState<MomentView[]>([])
  const [revision, setRevision] = useState(0)
  const [savedChoices, setSavedChoices] = useState({ selected: [] as string[], submitted: false })
  const currentKey = `${token}:${identityId ?? "anonymous"}`

  useEffect(() => {
    if (!ready) return
    let active = true
    const load = async () => {
      const stored = readGuestState(token, identityId)
      let acceptedId = stored?.planId
      if (!acceptedId) {
        try {
          const invitation = await controller.api.previewInvitation(token)
          if (!active) return
          setSummary(invitation)
          setPlanId("")
          setStage(invitation.plan.status === "collecting" ? "invite" : "closed")
          setSavedChoices({ selected: [], submitted: false })
          setBootError("")
          setBootKey(currentKey)
          return
        } catch (failure) {
          if (!identityId || !(failure instanceof ApiClientError) || failure.status !== 404) throw failure
          acceptedId = (await controller.api.acceptInvitation(token)).planId
        }
      }
      const invitation = await controller.api.getPlan(acceptedId)
      const { candidates } = invitation.plan.status === "collecting" ? await controller.api.getCandidateMoments(acceptedId) : { candidates: [] }
      const response = await controller.api.getOwnResponse(acceptedId)
      if (!active) return
      const views = momentViews(candidates)
      sessionStorage.setItem(`warmly:guest:${token}`, JSON.stringify({ planId: acceptedId, userId: identityId, hostName: invitation.hostName }))
      setSummary(invitation)
      setPlanId(acceptedId)
      setMoments(views)
      setSavedChoices(responseState(views, response))
      setStage(invitation.plan.status === "collecting" ? "moments" : "closed")
      setRevision((current) => current + 1)
      setBootError("")
      setBootKey(currentKey)
    }
    load().catch((failure: unknown) => {
      if (!active) return
      setSummary(null)
      setBootError(failure instanceof ApiClientError ? failure.message : "This invitation could not be loaded. Please try again.")
      setBootKey(currentKey)
    })
    return () => { active = false }
  }, [controller, token, ready, identityId, currentKey])

  const join = async () => {
    if (!identity || !summary) return
    let id = planId
    if (!id) {
      const accepted = await controller.api.acceptInvitation(token)
      id = accepted.planId
      sessionStorage.setItem(`warmly:guest:${token}`, JSON.stringify({ planId: id, userId: identity.id, hostName: summary.hostName }))
      setPlanId(id)
    }
    const { candidates } = await controller.api.getCandidateMoments(id)
    const response = await controller.api.getOwnResponse(id)
    const views = momentViews(candidates)
    setMoments(views)
    setSavedChoices(responseState(views, response))
    setRevision((current) => current + 1)
    setStage("moments")
  }
  const start = () => run(async () => {
    if (!identity) { await controller.signInWithGoogle(window.location.origin + window.location.pathname); return }
    const { connections } = await controller.api.listCalendarConnections()
    if (!connections.some((connection) => connection.status === "active" && connection.selected_calendars.length)) { setStage("calendar"); return }
    await join()
  })
  const submit = (selectedIds: string[]) => run(async () => {
    if (!summary) return
    await controller.api.saveMomentChoices(planId, { timeZone: summary.plan.time_zone, slots: choiceSlots(moments, selectedIds) })
  })
  const refresh = () => run(async () => {
    const invitation = await controller.api.getPlan(planId)
    setSummary(invitation)
    if (invitation.plan.status !== "collecting") { setStage("closed"); return }
    const { candidates } = await controller.api.getCandidateMoments(planId)
    const response = await controller.api.getOwnResponse(planId)
    const views = momentViews(candidates)
    setMoments(views)
    setSavedChoices(responseState(views, response))
    setRevision((current) => current + 1)
  })
  const loaded = bootKey === currentKey && ready
  const viewSummary = summary ? {
    hostName: summary.hostName,
    planName: summary.plan.name,
    dateLabel: `${summary.plan.start_date} to ${summary.plan.end_date}`,
    durationLabel: `${summary.plan.duration_minutes} minutes`,
  } : null

  return (
    <div className="grid w-full justify-items-center">
      {authError || bootError || error ? <p role="alert" className="max-w-xl px-4 pt-6 text-center text-sm text-destructive">{authError || bootError || error}</p> : null}
      {busy || !loaded ? <p role="status" className="py-6 text-sm text-muted-foreground">Loading your invitation...</p> : null}
      <fieldset disabled={busy || !loaded} className="contents">
        {loaded && viewSummary && (stage === "invite" || stage === "moments") ? <GuestFlow key={revision} initialStep={stage} summary={viewSummary} moments={moments} initialSelected={savedChoices.selected} initiallySubmitted={savedChoices.submitted} live onStart={start} onSubmit={submit} onStepChange={(step) => setStage(step)} onExit={() => window.location.assign("/")} /> : null}
        {loaded && summary && stage === "closed" ? <main className="grid min-h-dvh w-full place-items-center px-4"><Shell title={summary.plan.status === "booked" ? "It’s on." : "This plan is closed."} copy={summary.plan.status === "booked" ? `${summary.hostName} has confirmed ${summary.plan.name}.` : "This plan is no longer accepting choices."}>{summary.bookedMoment ? <p className="text-center">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: summary.plan.time_zone }).format(new Date(summary.bookedMoment.startsAt))}</p> : null}<Button className="mx-auto" onClick={() => window.location.assign("/")}>Back to Warmly</Button></Shell></main> : null}
        {loaded && stage === "calendar" ? <main className="grid min-h-dvh w-full place-items-center px-4 py-8"><CalendarSelection controller={controller} onBack={() => setStage("invite")} onContinue={() => run(join)} /></main> : null}
        {loaded && !viewSummary ? <main className="grid min-h-dvh place-items-center px-4"><Shell title="Let’s try again." copy="Check that the link is valid and that you signed in with the invited email."><div className="flex justify-center gap-2"><Button onClick={() => window.location.reload()}>Reload invitation</Button>{!identity ? <Button variant="outline" onClick={() => run(() => controller.signInWithGoogle(window.location.origin + window.location.pathname))}>Sign in with Google</Button> : <Button variant="outline" onClick={() => run(() => controller.signOut())}>Switch account</Button>}</div></Shell></main> : null}
        {loaded && stage === "moments" ? <Button variant="ghost" className="mb-6" onClick={refresh}>Refresh available moments</Button> : null}
      </fieldset>
      {summary ? <p className="mb-6 text-xs text-muted-foreground">Times in {summary.plan.time_zone}.{stage === "moments" ? " You can choose up to 50 moments." : ""}</p> : null}
    </div>
  )
}
