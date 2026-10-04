import { lazy, Suspense, useId, useState } from "react"
import { Form } from "react-aria-components"
import type { CalendarDate } from "@internationalized/date"
import type { RangeValue } from "@react-types/shared"
import { ArrowLeft, ArrowRight, Check, Copy, LockKeyhole, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FriendPortraits, Journey, PrivacyNote } from "@/components/warmly/brand"
import { AppHeader } from "@/components/warmly/app-header"
import {
  activityPlan,
  activities,
  candidateMoments,
  formatDate,
  hostSteps,
  initialDateRange,
  recentPeople,
  personFromEmail,
  toggleDaypart,
  dateRangeError,
  type HostStep,
  type Person,
  type MomentView,
} from "./model"

const WarmlyDateRangePicker = lazy(async () => {
  const module = await import("@/components/warmly/date-range-picker")
  return { default: module.WarmlyDateRangePicker }
})

export type PlanState = {
  activityId: string
  name: string
  duration: number
  dateRange: RangeValue<CalendarDate>
  dayparts: string[]
}

type Props = {
  step: HostStep
  onStepChange: (step: HostStep) => void
  onPreviewGuest: () => void
  dark: boolean
  onDarkChange: (dark: boolean) => void
}

const stepProgress: Record<HostStep, number> = {
  "sign-in": 0.04,
  calendar: 0.16,
  create: 0.36,
  invite: 0.58,
  moments: 0.78,
  confirm: 0.92,
  success: 1,
}

export function HostFlow({ step, onStepChange, onPreviewGuest, dark, onDarkChange }: Props) {
  const [plan, setPlan] = useState<PlanState>({
    activityId: "catch-up",
    name: "Catch up",
    duration: 60,
    dateRange: initialDateRange,
    dayparts: ["Any time"],
  })
  const [people, setPeople] = useState<Person[]>([
    { name: "You", email: "you", initials: "YO", status: "host" },
  ])
  const [selectedMoment, setSelectedMoment] = useState(candidateMoments[0].id)
  const index = hostSteps.indexOf(step)
  const goBack = () => onStepChange(hostSteps[Math.max(0, index - 1)])
  const goNext = () => onStepChange(hostSteps[Math.min(hostSteps.length - 1, index + 1)])

  return (
    <HostFrame step={step} dark={dark} onDarkChange={onDarkChange}>
        {step === "sign-in" && <SignIn onContinue={goNext} />}
        {step === "calendar" && <CalendarAccess onBack={goBack} onContinue={goNext} />}
        {step === "create" && (
          <CreatePlan plan={plan} onPlanChange={setPlan} onBack={goBack} onContinue={goNext} />
        )}
        {step === "invite" && (
          <InviteFriends
            people={people}
            onPeopleChange={setPeople}
            onBack={goBack}
            onContinue={goNext}
            onPreviewGuest={onPreviewGuest}
          />
        )}
        {step === "moments" && (
          <MomentPicker
            plan={plan}
            selected={selectedMoment}
            onSelectedChange={setSelectedMoment}
            onBack={goBack}
            onContinue={goNext}
          />
        )}
        {step === "confirm" && (
          <ConfirmPlan plan={plan} selected={selectedMoment} people={people} onBack={goBack} onContinue={goNext} />
        )}
        {step === "success" && <Success planName={plan.name} selected={selectedMoment} />}
    </HostFrame>
  )
}

export function HostFrame({ step, dark, onDarkChange, children }: {
  step: HostStep
  dark: boolean
  onDarkChange: (dark: boolean) => void
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-7 sm:py-7">
      <div className="mb-5">
        <AppHeader dark={dark} onDarkChange={onDarkChange}>
          {step !== "sign-in" && step !== "calendar" ? <Journey progress={stepProgress[step]} /> : null}
        </AppHeader>
      </div>
      <section className="grid flex-1 place-items-center pb-8">{children}</section>
    </main>
  )
}

export function Shell({
  eyebrow,
  title,
  copy,
  children,
  footer,
  className = "",
}: {
  eyebrow?: string
  title: string
  copy?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={`min-w-0 w-full max-w-xl gap-0 overflow-hidden rounded-[2rem] border-border/70 bg-card/95 py-0 shadow-[0_24px_80px_-38px_color-mix(in_oklab,var(--primary)_32%,transparent)] ${className}`}>
      <CardHeader className="gap-2 px-6 pb-5 pt-7 text-center sm:px-9 sm:pt-9">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p> : null}
        <h1 className="font-heading text-3xl font-semibold leading-tight text-foreground sm:text-4xl">{title}</h1>
        {copy ? <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">{copy}</p> : null}
      </CardHeader>
      <CardContent className="min-w-0 px-6 pb-7 sm:px-9">{children}</CardContent>
      {footer ? <CardFooter className="grid gap-2 border-t bg-secondary/35 px-6 py-4 [&>button:first-child]:justify-self-start min-[380px]:flex min-[380px]:justify-between sm:px-9">{footer}</CardFooter> : null}
    </Card>
  )
}

export function SignIn({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="grid w-full max-w-4xl items-stretch gap-5 md:grid-cols-[0.9fr_1.1fr]">
      <Card className="justify-between rounded-[2rem] border-0 bg-primary px-5 py-8 text-primary-foreground shadow-xl">
        <CardContent className="grid h-full place-items-center gap-6 p-0 text-center">
          <FriendPortraits />
          <div>
            <p className="font-heading text-3xl font-semibold">Make time feel easy.</p>
            <p className="mt-2 text-sm text-primary-foreground/75">Find a moment without sharing the details.</p>
          </div>
          <Journey progress={0.08} />
        </CardContent>
      </Card>
      <Card className="min-h-[30rem] justify-between rounded-[2rem] px-6 py-7 sm:px-10">
        <p className="text-sm font-semibold text-primary">♥ &nbsp;Sign in</p>
        <div className="text-center">
          <h1 className="font-heading text-5xl font-semibold leading-[0.98] tracking-tight sm:text-6xl">
            Your plans,<br />in one place.
          </h1>
        </div>
        <div className="grid justify-items-center gap-3">
          <Button size="lg" className="rounded-full px-6" onClick={onContinue}>
            <GoogleMark /> Continue with Google
          </Button>
          <p className="text-xs text-muted-foreground">Used only to create your Warmly account.</p>
        </div>
      </Card>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.7h3.3c1.9-1.8 2.9-4.4 2.9-7.7z" />
      <path fill="currentColor" opacity=".8" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.8A10 10 0 0 0 12 22z" />
      <path fill="currentColor" opacity=".6" d="M6.4 13.9A6 6 0 0 1 6.1 12c0-.7.1-1.3.3-1.9V7.3H3A10 10 0 0 0 2 12c0 1.7.4 3.3 1 4.7l3.4-2.8z" />
      <path fill="currentColor" opacity=".4" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3 7.3l3.4 2.8C7.2 7.8 9.4 6 12 6z" />
    </svg>
  )
}

export function CalendarAccess({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <Shell
      eyebrow="Calendar access"
      title="We only see when you’re available."
      copy="Connect the calendars that should count when friends find a time with you."
      footer={<><Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button><span /></>}
    >
      <div className="grid gap-6">
        <PrivacyNote>Event names, guests, and details stay private.</PrivacyNote>
        <div className="rounded-3xl bg-secondary/70 p-5">
          <div className="grid grid-cols-7 gap-2" aria-hidden>
            {[1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1].map((busy, index) => (
              <span key={index} className={`h-7 rounded-lg ${busy ? "bg-primary/18" : "bg-card"}`} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5" /> Free or busy, never the details
          </div>
        </div>
        <Button size="lg" className="mx-auto rounded-full px-6" onClick={onContinue}>
          Connect Google Calendar
        </Button>
      </div>
    </Shell>
  )
}

export function CreatePlan({
  plan,
  onPlanChange,
  onBack,
  onContinue,
}: {
  plan: PlanState
  onPlanChange: (plan: PlanState) => void
  onBack: () => void
  onContinue: () => void
}) {
  const formId = useId()
  const [datesComplete, setDatesComplete] = useState(true)
  const dateError = dateRangeError(plan.dateRange)
  const invalid = !datesComplete || !!dateError || !plan.name.trim() || plan.name.trim().length > 120
  const selectActivity = (id: string) => {
    const activity = activityPlan(id)
    if (activity) onPlanChange({ ...plan, ...activity })
  }

  return (
    <Shell
      eyebrow="A new plan"
      title="What shall we make time for?"
      copy="Start with the feeling. You can adjust everything before inviting anyone."
      className="max-w-3xl"
      footer={<><Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button><Button type="submit" form={formId} disabled={invalid}>Invite friends <ArrowRight /></Button></>}
    >
      <div className="grid gap-7">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {activities.map((activity) => (
            <Button
              key={activity.id}
              variant={plan.activityId === activity.id ? "default" : "outline"}
              className="h-auto min-w-0 justify-start rounded-2xl px-3 py-4 text-left sm:px-4"
              aria-pressed={plan.activityId === activity.id}
              onClick={() => selectActivity(activity.id)}
            >
              <span className="shrink-0 text-lg">{activity.icon}</span>
              <span className="min-w-0 whitespace-normal">{activity.label}</span>
            </Button>
          ))}
        </div>
        <Form id={formId} className="grid gap-7" onSubmit={(event) => { event.preventDefault(); if (!invalid) onContinue() }}>
        <label className="grid gap-2 text-sm font-semibold">
          Plan name
          <Input required maxLength={120} value={plan.name} onChange={(event) => onPlanChange({ ...plan, name: event.target.value })} className="h-11 rounded-xl" />
        </label>
        <Suspense fallback={<div className="h-[4.75rem] animate-pulse motion-reduce:animate-none rounded-2xl bg-secondary/70" aria-label="Loading date picker" />}>
          <WarmlyDateRangePicker
            value={plan.dateRange}
            onChange={(dateRange) => dateRange && onPlanChange({ ...plan, dateRange })}
            onValidityChange={setDatesComplete}
          />
        </Suspense>
        {!datesComplete ? <p role="alert" className="text-sm text-destructive">Complete both dates before continuing.</p> : null}
        </Form>
        <div className="grid gap-2">
          <p className="text-sm font-semibold">How long?</p>
          <div className="flex flex-wrap gap-2">
            {[30, 45, 60, 90, 120].map((duration) => (
              <Button key={duration} size="sm" variant={plan.duration === duration ? "default" : "outline"} aria-pressed={plan.duration === duration} onClick={() => onPlanChange({ ...plan, duration })}>
                {duration < 60 ? `${duration} min` : `${duration / 60} hr`}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Best time of day</p>
          <div className="flex flex-wrap gap-2">
            {["Any time", "Morning", "Afternoon", "Evening"].map((daypart) => (
              <Button key={daypart} size="sm" variant={plan.dayparts.includes(daypart) ? "default" : "outline"} aria-pressed={plan.dayparts.includes(daypart)} onClick={() => onPlanChange({ ...plan, dayparts: toggleDaypart(plan.dayparts, daypart) })}>
                {daypart}
              </Button>
            ))}
          </div>
        </div>
        <PrivacyNote>Only free or busy. Never the details.</PrivacyNote>
      </div>
    </Shell>
  )
}

export function InviteFriends({
  people,
  onPeopleChange,
  onBack,
  onContinue,
  onPreviewGuest,
  onInvite,
  showRecent = true,
  connectedCalendarCount = 2,
  onRemove,
  onReissue,
}: {
  people: Person[]
  onPeopleChange: (people: Person[]) => void
  onBack: () => void
  onContinue: () => void
  onPreviewGuest?: () => void
  onInvite?: (person: Person) => Promise<boolean>
  showRecent?: boolean
  connectedCalendarCount?: number
  onRemove?: (person: Person) => void
  onReissue?: (person: Person) => void
}) {
  const [email, setEmail] = useState("")
  const addPerson = (person: Person) => {
    if (people.some((item) => item.email === person.email)) return
    onPeopleChange([...people, { ...person, status: "invited" }])
  }
  const inviteEmail = async () => {
    const person = personFromEmail(email)
    if (!person) return
    if (onInvite) { if (!await onInvite(person)) return }
    else addPerson(person)
    setEmail("")
  }

  return (
    <Shell
      eyebrow="Invite friends"
      title="Who should be part of this?"
      copy="They will only share when they are free. Their calendar details stay theirs."
      footer={<><Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button><Button onClick={onContinue}>Find moments <ArrowRight /></Button></>}
    >
      <div className="grid min-w-0 gap-6">
        <form className="grid min-w-0 items-center gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); inviteEmail() }}>
          <Input type="email" inputMode="email" autoComplete="email" aria-label="Friend’s email address" placeholder="friend@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-xl" />
          <Button type="submit"><Plus /> Invite</Button>
        </form>
        {showRecent ? <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-semibold">Recent people</p>
            <p className="text-xs text-muted-foreground">From earlier plans</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentPeople.map((person) => {
              const added = people.some((item) => item.email === person.email)
              return (
                <Button key={person.email} size="sm" variant="outline" disabled={added} onClick={() => addPerson(person)} className="rounded-full">
                  <span className="grid size-6 place-items-center rounded-full bg-secondary text-[10px]">{person.initials}</span>
                  {person.name}
                </Button>
              )
            })}
          </div>
        </div> : <p className="text-xs leading-5 text-muted-foreground">Copy each private invitation link and send it to your friend. Email delivery is not enabled yet.</p>}
        <div className="min-w-0">
          <p className="mb-1 text-sm font-semibold">People in this plan</p>
          <p className="mb-3 text-xs leading-5 text-muted-foreground">Ready means they joined and shared availability. Invited means you’re waiting for their reply.</p>
          <div className="grid min-w-0 gap-2">
            {people.map((person) => (
              <div key={person.email} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl border bg-secondary/30 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <span className="grid size-9 place-items-center rounded-full bg-primary/5 text-xs font-semibold text-primary">{person.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{person.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{person.status === "host" ? `${connectedCalendarCount} calendars connected` : person.email}</p>
                </div>
                <Badge variant={person.status === "host" ? "default" : "secondary"} className="capitalize">{person.status}</Badge>
                {person.inviteUrl || (onReissue && person.invitationId) || (onRemove && person.status !== "host") ? (
                  <div className="col-span-3 flex min-w-0 flex-wrap justify-end gap-1 sm:col-span-1">
                    {person.inviteUrl ? <Button variant="ghost" size="icon" aria-label={`Copy invitation for ${person.name}`} onClick={() => navigator.clipboard.writeText(person.inviteUrl!).catch(() => undefined)}><Copy /></Button> : null}
                    {onReissue && person.invitationId && !person.inviteUrl ? <Button variant="ghost" size="sm" aria-label={`New invitation link for ${person.name}`} onClick={() => onReissue(person)}>New link</Button> : null}
                    {onRemove && person.status !== "host" ? <Button variant="ghost" size="sm" aria-label={`Remove ${person.name}`} onClick={() => onRemove(person)}>Remove</Button> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {people.filter((person) => person.inviteUrl).map((person) => (
            <label key={person.email} className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-xs text-muted-foreground">
              <span className="min-w-0 wrap-anywhere">Private link for {person.name}</span>
              <Input readOnly value={person.inviteUrl} onFocus={(event) => event.target.select()} />
            </label>
          ))}
          {onReissue ? <p className="mt-3 text-xs text-muted-foreground">Links are shown only when created. New link invalidates the previous invitation.</p> : null}
        </div>
        {onPreviewGuest ? <Button variant="ghost" className="mx-auto" onClick={onPreviewGuest}>Preview the guest invite</Button> : null}
      </div>
    </Shell>
  )
}

export function MomentPicker({
  plan,
  selected,
  onSelectedChange,
  onBack,
  onContinue,
  moments = candidateMoments,
}: {
  plan: PlanState
  selected: string
  onSelectedChange: (id: string) => void
  onBack: () => void
  onContinue: () => void
  moments?: MomentView[]
}) {
  return (
    <Shell
      eyebrow="Shared availability"
      title="These moments look good."
      copy={`${plan.name} · ${formatDate(plan.dateRange.start)} to ${formatDate(plan.dateRange.end)}`}
      footer={<><Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button><Button disabled={!moments.some((moment) => moment.id === selected)} onClick={onContinue}>Review this time <ArrowRight /></Button></>}
    >
      <div className="grid gap-3">
        {!moments.length ? <p className="py-4 text-center text-sm text-muted-foreground">No shared moments yet. Wait for friends to connect their calendars, then refresh availability.</p> : null}
        {moments.map((moment) => (
          <button
            key={moment.id}
            type="button"
            aria-pressed={selected === moment.id}
            onClick={() => onSelectedChange(moment.id)}
            className={`flex min-w-0 items-center justify-between gap-3 rounded-2xl border p-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${selected === moment.id ? "border-primary bg-primary/8" : "hover:bg-secondary/50"}`}
          >
            <span className="min-w-0"><strong className="block font-heading text-lg">{moment.day}</strong><span className="text-sm text-muted-foreground">{moment.note}</span></span>
            <span className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap text-primary">{moment.time}{selected === moment.id ? <Check className="size-4" /> : null}</span>
          </button>
        ))}
        <PrivacyNote>Availability is rechecked before the invitation is created.</PrivacyNote>
      </div>
    </Shell>
  )
}

export function ConfirmPlan({
  plan,
  selected,
  people,
  onBack,
  onContinue,
  moments = candidateMoments,
  actionLabel = "Create the event",
  preview = true,
}: {
  plan: PlanState
  selected: string
  people: Person[]
  onBack: () => void
  onContinue: () => void
  moments?: MomentView[]
  actionLabel?: string
  preview?: boolean
}) {
  const moment = moments.find((item) => item.id === selected)
  if (!moment) return null
  return (
    <Shell
      eyebrow="One last look"
      title={plan.name}
      copy={preview ? "You will create the calendar event and everyone invited will receive it." : "You will create the calendar event for people who joined. Pending invitations are not included."}
      footer={<><Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button><Button onClick={onContinue}>{actionLabel} <Check /></Button></>}
    >
      <div className="grid gap-3 rounded-3xl bg-secondary/60 p-5">
        <SummaryRow label="When" value={`${moment.day} at ${moment.time}`} />
        <SummaryRow label="Length" value={plan.duration < 60 ? `${plan.duration} minutes` : `${plan.duration / 60} hour`} />
        <SummaryRow label="People" value={`${people.length} invited`} />
        <SummaryRow label="Organizer" value="You" />
      </div>
    </Shell>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><strong className="text-right">{value}</strong></div>
}

export function Success({ planName, selected, moments = candidateMoments, preview = true }: { planName: string; selected: string; moments?: MomentView[]; preview?: boolean }) {
  const moment = moments.find((item) => item.id === selected)
  if (!moment) return null
  return (
    <Shell eyebrow="It’s on" title="A little time together." copy={preview ? "The invitation is ready and everyone’s calendar details stayed private." : "The calendar event is created, and everyone’s calendar details stayed private."}>
      <div className="grid justify-items-center gap-5 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-7" /></span>
        <div><p className="font-heading text-2xl font-semibold">{planName}</p><p className="mt-1 text-sm text-muted-foreground">{moment.day} · {moment.time}</p></div>
        {preview ? <Button variant="outline" className="rounded-full"><Copy /> Copy invitation link</Button> : null}
      </div>
    </Shell>
  )
}
