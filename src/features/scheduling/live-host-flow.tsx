import { useCallback, useEffect, useState } from "react"
import { getLocalTimeZone, today } from "@internationalized/date"
import { z } from "zod"
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components"
import { Button } from "@/components/ui/button"
import type { CalendarConnection, PlanRecord } from "@/services/api-types"
import type { ProductionController } from "@/services/production-controller"
import { CalendarSelection } from "./calendar-selection"
import { ConfirmPlan, CreatePlan, HostFrame, InviteFriends, MomentPicker, Shell, SignIn, Success, type PlanState } from "./host-flow"
import { momentViews, peopleViews, planInput, planState } from "./flow-mapping"
import { rememberCalendarReturn, useLiveIdentity, useRequest } from "./live-hooks"
import type { HostStep, MomentView, Person } from "./model"

const storedHostSchema = z.object({
  planId: z.uuid(),
  step: z.enum(["invite", "moments", "confirm", "success"]),
  selected: z.string(),
  bookingKey: z.uuid(),
  moments: z.array(z.object({ id: z.string(), day: z.string(), time: z.string(), note: z.string(), startsAt: z.string(), endsAt: z.string() })),
})

function readStoredHost(userId: string) {
  try {
    const result = storedHostSchema.safeParse(JSON.parse(sessionStorage.getItem(`warmly:host:${userId}`) ?? "null"))
    return result.success ? result.data : null
  } catch { return null }
}

function newPlan(): PlanState {
  return {
    activityId: "catch-up", name: "Catch up", duration: 60,
    dateRange: { start: today(getLocalTimeZone()), end: today(getLocalTimeZone()).add({ days: 6 }) },
    dayparts: ["Any time"],
  }
}

export function LiveHostFlow({ controller, dark, onDarkChange }: {
  controller: ProductionController
  dark: boolean
  onDarkChange: (dark: boolean) => void
}) {
  const { identity, ready, error: authError } = useLiveIdentity(controller)
  const { busy, error, run, clearError } = useRequest()
  const [loadedUserId, setLoadedUserId] = useState("")
  const [bootDoneId, setBootDoneId] = useState("")
  const [bootError, setBootError] = useState("")
  const identityId = identity?.id
  const bootLoading = !!identityId && bootDoneId !== identityId
  const loaded = !!identityId && identityId === loadedUserId
  const [step, setStep] = useState<HostStep>("calendar")
  const [planId, setPlanId] = useState("")
  const [plan, setPlan] = useState<PlanState>(newPlan)
  const [timeZone, setTimeZone] = useState(getLocalTimeZone)
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [moments, setMoments] = useState<MomentView[]>([])
  const [selected, setSelected] = useState("")
  const [bookingKey, setBookingKey] = useState<string>(() => crypto.randomUUID())
  const [bookingPending, setBookingPending] = useState(false)
  const [previousPlans, setPreviousPlans] = useState<PlanRecord[] | null>(null)
  const [confirmCancellation, setConfirmCancellation] = useState(false)
  const [requestedPlanId, setRequestedPlanId] = useState(() => /^\/plans\/([0-9a-f-]{36})\/?$/i.exec(window.location.pathname)?.[1] ?? "")

  const refreshPeople = useCallback(async (id: string) => {
    const result = await controller.api.getPlanPeople(id)
    setPeople((previous) => peopleViews(result, previous))
  }, [controller])
  const fetchMoments = useCallback(async (id: string) => {
    const [{ candidates }, summary] = await Promise.all([controller.api.getCandidateMoments(id), controller.api.getResponseSummary(id)])
    return momentViews(candidates).map((moment) => ({ ...moment, note: `${moment.note} · ${summary.moments.find((choice) => Date.parse(choice.startsAt) === Date.parse(moment.id))?.responseCount ?? 0} choices` }))
  }, [controller])
  const refreshMoments = useCallback(async (id: string) => {
    const [result, currentMoments] = await Promise.all([controller.api.getPlanPeople(id), fetchMoments(id)])
    setPeople((previous) => peopleViews(result, previous))
    setMoments(currentMoments)
  }, [controller, fetchMoments])

  useEffect(() => {
    if (!identityId) return
    const userId = identityId
    let active = true
    async function load() {
      const { connections: current } = await controller.api.listCalendarConnections()
      const stored = readStoredHost(userId)
      const targetId = requestedPlanId || stored?.planId
      if (targetId) {
        const { plan: currentPlan } = await controller.api.getPlan(targetId)
        if (currentPlan.status === "draft") await controller.api.openPlan(currentPlan.id)
        if (currentPlan.status === "cancelled") throw new Error("Plan cancelled")
        const [result, { booking }] = await Promise.all([
          controller.api.getPlanPeople(currentPlan.id),
          controller.api.getBooking(currentPlan.id),
        ])
        const pending = booking?.status === "pending"
        if (currentPlan.status === "booked" && booking?.status !== "created") throw new Error("Booking state missing")
        const currentMoments = booking && (pending || booking.status === "created") ? momentViews([{
          start: booking.starts_at, end: booking.ends_at, timeZone: currentPlan.time_zone,
          availableCount: result.people.length, unavailableCount: 0, score: 0,
        }]).map((moment) => ({ ...moment, note: pending ? "Booking awaiting confirmation" : "Confirmed" })) : await fetchMoments(currentPlan.id)
        if (!active) return
        setPlan(planState(currentPlan))
        setTimeZone(currentPlan.time_zone)
        setPlanId(currentPlan.id)
        setSelected(booking ? booking.starts_at : stored?.selected ?? "")
        setBookingKey(booking?.idempotency_key ?? stored?.bookingKey ?? crypto.randomUUID())
        setBookingPending(pending)
        setMoments(currentMoments)
        setPeople(peopleViews(result))
        setStep(currentPlan.status === "booked" ? "success" : pending ? "confirm" : stored?.step && stored.step !== "success" ? stored.step : "invite")
      } else {
        if (!active) return
        setPlanId("")
        setPlan(newPlan())
        setTimeZone(getLocalTimeZone())
        setPeople([])
        setMoments([])
        setSelected("")
        setBookingKey(crypto.randomUUID())
        setBookingPending(false)
        setStep("calendar")
      }
      setConnections(current.filter((connection) => connection.status === "active"))
      setBootError("")
      setLoadedUserId(userId)
    }
    void load().catch(() => {
      if (active) setBootError("Your plan could not be loaded. Please refresh.")
    }).finally(() => {
      if (active) setBootDoneId(userId)
    })
    return () => { active = false }
  }, [controller, identityId, requestedPlanId, fetchMoments])

  useEffect(() => {
    if (!loaded || !identityId || !planId || !["invite", "moments", "confirm", "success"].includes(step)) return
    sessionStorage.setItem(`warmly:host:${identityId}`, JSON.stringify({ planId, step, selected, bookingKey, moments }))
  }, [loaded, identityId, planId, step, selected, bookingKey, moments])

  const create = () => run(async () => {
    if (!identity) return
    const { plan: created } = planId ? await controller.api.getPlan(planId) : await controller.api.createPlan(planInput(plan, timeZone))
    setPlanId(created.id)
    setPlan(planState(created))
    sessionStorage.setItem(`warmly:host:${identity.id}`, JSON.stringify({ planId: created.id, step: "invite", selected: "", bookingKey, moments: [] }))
    if (created.status === "draft") await controller.api.openPlan(created.id)
    await refreshPeople(created.id)
    setStep("invite")
    window.history.replaceState(null, "", `/plans/${created.id}`)
  })
  const invite = (person: Person) => run(async () => {
    const { invitation, inviteUrl } = await controller.api.createInvitation(planId, person.email)
    setPeople((current) => [...current, { ...person, invitationId: invitation.id, inviteUrl }])
  })
  const remove = (person: Person) => run(async () => {
    if (person.invitationId) await controller.api.cancelInvitation(planId, person.invitationId)
    else if (person.userId) await controller.api.removeParticipant(planId, person.userId)
    await refreshPeople(planId)
  })
  const reissue = (person: Person) => run(async () => {
    if (!person.invitationId) return
    await controller.api.cancelInvitation(planId, person.invitationId)
    setPeople((current) => current.filter((item) => item.invitationId !== person.invitationId))
    const { invitation, inviteUrl } = await controller.api.createInvitation(planId, person.email)
    setPeople((current) => [...current, { ...person, invitationId: invitation.id, inviteUrl }])
  })
  const restart = () => {
    if (!identityId) return
    sessionStorage.removeItem(`warmly:host:${identityId}`)
    window.history.replaceState(null, "", "/")
    setRequestedPlanId("")
    setPlanId("")
    setPlan(newPlan())
    setTimeZone(getLocalTimeZone())
    setSelected("")
    setMoments([])
    setPeople([])
    setBookingKey(crypto.randomUUID())
    setBookingPending(false)
    setPreviousPlans(null)
    setBootError("")
    setLoadedUserId(identityId)
    setStep("calendar")
  }
  const canBook = connections.some((connection) => connection.granted_scopes.includes("https://www.googleapis.com/auth/calendar.events") && connection.selected_calendars.length)
  const book = () => run(async () => {
    if (!canBook) {
      rememberCalendarReturn("/")
      await controller.connectGoogleCalendar("booking")
      return
    }
    const moment = moments.find((candidate) => candidate.id === selected)
    if (!moment?.startsAt || !moment.endsAt) return
    try {
      await controller.api.createBooking(planId, { startsAt: moment.startsAt, endsAt: moment.endsAt, idempotencyKey: bookingKey })
    } catch (failure) {
      const { booking } = await controller.api.getBooking(planId)
      setBookingPending(booking?.status === "pending")
      throw failure
    }
    setBookingPending(false)
    setStep("success")
  })
  const count = connections.reduce((total, connection) => total + connection.selected_calendars.length, 0)
  const currentStep = identity ? step : "sign-in"
  const pageError = authError || bootError || (confirmCancellation ? "" : error)

  return (
    <HostFrame step={currentStep} dark={dark} onDarkChange={onDarkChange}>
      <div className="grid w-full justify-items-center gap-4">
        {pageError ? <p role="alert" className="max-w-xl text-center text-sm text-destructive">{pageError}</p> : null}
        {busy || bootLoading || !ready ? <p role="status" className="text-sm text-muted-foreground">Working on it...</p> : null}
        <fieldset disabled={busy || bootLoading || !ready} className="contents">
          {!identity && ready ? <SignIn onContinue={() => run(() => controller.signInWithGoogle(window.location.origin + "/"))} /> : null}
          {identity && loaded && step === "calendar" ? <CalendarSelection controller={controller} onBack={() => run(() => controller.signOut())} onContinue={(current) => { setConnections(current); setStep(planId ? "invite" : "create") }} /> : null}
          {identity && loaded && step === "create" ? <CreatePlan plan={plan} onPlanChange={setPlan} onBack={() => setStep("calendar")} onContinue={create} /> : null}
          {identity && loaded && step === "invite" ? <InviteFriends people={people} onPeopleChange={setPeople} onInvite={invite} onRemove={remove} onReissue={reissue} showRecent={false} connectedCalendarCount={count} onBack={() => setStep("calendar")} onContinue={() => run(async () => { await refreshMoments(planId); setStep("moments") })} /> : null}
          {identity && loaded && step === "moments" ? <MomentPicker plan={plan} moments={moments} selected={selected} onSelectedChange={(id) => { setSelected(id); setBookingKey(crypto.randomUUID()) }} onBack={() => setStep("invite")} onContinue={() => setStep("confirm")} /> : null}
          {identity && loaded && step === "confirm" && !bookingPending ? <ConfirmPlan preview={false} plan={plan} moments={moments} people={people.filter((person) => person.status !== "invited")} selected={selected} onBack={() => setStep("moments")} onContinue={book} actionLabel={canBook ? "Create the event" : "Allow event creation"} /> : null}
          {identity && loaded && step === "confirm" && bookingPending ? <Shell title="Finish this booking." copy="The calendar may already contain this event. Retry safely to reconcile it rather than creating another."><Button className="mx-auto" onClick={book}>{canBook ? "Retry confirmation" : "Restore calendar permission"}</Button></Shell> : null}
          {identity && loaded && step === "success" ? <Success planName={plan.name} selected={selected} moments={moments} preview={false} /> : null}
          {identity && !loaded && !busy && !bootLoading ? <Shell title="Let’s try again." copy="Your plan could not be loaded."><Button onClick={() => window.location.reload()}>Reload</Button></Shell> : null}
          {identity && loaded && (step === "invite" || step === "moments") ? <Button variant="ghost" onClick={() => run(async () => { if (step === "moments") await refreshMoments(planId); else await refreshPeople(planId) })}>Refresh {step === "moments" ? "availability and choices" : "participant status"}</Button> : null}
          {identity && loaded && step === "confirm" && !moments.some((moment) => moment.id === selected) ? <Shell title="That moment is no longer available."><Button onClick={() => setStep("moments")}>Choose another moment</Button></Shell> : null}
          {identity && !busy && !bootLoading ? <div className="flex flex-wrap justify-center gap-2"><Button variant="ghost" onClick={() => run(async () => setPreviousPlans((await controller.api.listPlans()).plans))}>Your plans</Button><Button variant="ghost" onClick={restart}>Start a new plan</Button><Button variant="ghost" onClick={() => run(() => controller.signOut())}>Sign out</Button></div> : null}
          {identity && loaded && !bookingPending && (step === "invite" || step === "moments") ? <Button variant="ghost" onClick={() => { clearError(); setConfirmCancellation(true) }}>Cancel this plan</Button> : null}
          {previousPlans ? <Shell title="Your plans."><div className="grid min-w-0 gap-2">{previousPlans.length ? previousPlans.map((previous) => <Button key={previous.id} className="h-auto min-w-0 justify-start py-3 text-left whitespace-normal" disabled={previous.status === "cancelled"} variant="outline" onClick={() => window.location.assign(`/plans/${previous.id}`)}>{previous.name} · {previous.status}</Button>) : <p className="text-center text-sm text-muted-foreground">No previous plans yet.</p>}<Button variant="ghost" onClick={() => setPreviousPlans(null)}>Close</Button></div></Shell> : null}
        </fieldset>
        {identity && loaded ? <p className="text-xs text-muted-foreground">Times in {timeZone}. Pending invitations are not included in calendar events.</p> : null}
      </div>
      <ModalOverlay isOpen={confirmCancellation} onOpenChange={setConfirmCancellation} isDismissable={!busy} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <Modal className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border bg-background p-6 shadow-lg">
          <Dialog role="alertdialog" className="grid gap-4 outline-none">
            <Heading slot="title" className="font-heading text-2xl font-semibold">Cancel this plan?</Heading>
            <p className="text-sm text-muted-foreground">Invitation links will stop accepting people, and guests will no longer be able to submit choices.</p>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2"><Button disabled={busy} variant="outline" onClick={() => setConfirmCancellation(false)}>Keep plan</Button><Button disabled={busy} onClick={() => run(async () => { await controller.api.cancelPlan(planId); setConfirmCancellation(false); restart() })}>Cancel plan</Button></div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </HostFrame>
  )
}
