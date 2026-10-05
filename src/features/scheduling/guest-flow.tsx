import { useState } from "react"
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { FriendPortraits, PrivacyNote } from "@/components/warmly/brand"
import { candidateMoments, type MomentView } from "./model"

type GuestStep = "invite" | "moments"

type Props = {
  initialStep: GuestStep
  onStepChange: (step: GuestStep) => void
  onExit: () => void
  summary?: { hostName: string; planName: string; dateLabel: string; durationLabel: string }
  moments?: MomentView[]
  onStart?: () => void
  onSubmit?: (selectedIds: string[]) => Promise<boolean>
  live?: boolean
  initialSelected?: string[]
  initiallySubmitted?: boolean
}

export function GuestFlow({ initialStep, onStepChange, onExit, summary = { hostName: "Maya", planName: "Catch up", dateLabel: "Oct 12 to Oct 18", durationLabel: "1 hour" }, moments = candidateMoments, onStart, onSubmit, live = false, initialSelected = [], initiallySubmitted = false }: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [submitted, setSubmitted] = useState(initiallySubmitted)

  const toggle = (id: string) => {
    if (live && selected.length >= 50 && !selected.includes(id)) return
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setSubmitted(false)
  }

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-6rem)] w-full max-w-3xl place-items-center px-4 py-8">
      <Card className="w-full rounded-[2rem] border-border/70 px-2 py-4 shadow-[0_24px_80px_-38px_color-mix(in_oklab,var(--primary)_32%,transparent)] sm:px-6 sm:py-7">
        {initialStep === "invite" ? (
          <>
            <CardHeader className="items-center gap-4 text-center">
              <FriendPortraits />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">A private invitation</p>
              <h1 className="font-heading text-4xl font-semibold">{summary.hostName} invited you.</h1>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">Share when you are free for {summary.planName}. {summary.hostName} and the group will never see what is on your calendar.</p>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-3 rounded-3xl bg-secondary/60 p-5">
                <SummaryRow label="Plan" value={summary.planName} />
                <SummaryRow label="Dates" value={summary.dateLabel} />
                <SummaryRow label="Length" value={summary.durationLabel} />
              </div>
              <PrivacyNote>Only your availability is shared, never event details.</PrivacyNote>
              <Button size="lg" className="mx-auto rounded-full px-6" onClick={onStart ?? (() => onStepChange("moments"))}>Share my availability <ArrowRight /></Button>
              <Button variant="ghost" className="mx-auto" onClick={onExit}><ArrowLeft /> {live ? "Leave invitation" : "Back to host view"}</Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="items-center gap-2 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{summary.planName}</p>
              <h1 className="font-heading text-4xl font-semibold">When could you make it?</h1>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">Choose every moment that works. {summary.hostName} will use everyone’s responses to confirm one.</p>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3">
                {!moments.length ? <p className="py-4 text-center text-sm text-muted-foreground">No shared moments yet. Try refreshing after the group shares availability.</p> : null}
                {moments.map((moment) => {
                  const active = selected.includes(moment.id)
                  return (
                    <button
                      key={moment.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(moment.id)}
                      className={`flex min-w-0 items-center justify-between gap-3 rounded-2xl border p-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary bg-primary/8" : "hover:bg-secondary/50"}`}
                    >
                      <span className="min-w-0"><strong className="block font-heading text-lg">{moment.day}</strong><span className="text-sm text-muted-foreground">{moment.note}</span></span>
                      <span className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap text-primary">{moment.time}{active ? <Check className="size-4" /> : null}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" /> Your calendar details stay private.</div>
              <p className="text-center text-sm font-medium text-primary">{selected.length ? `${selected.length} moment${selected.length === 1 ? "" : "s"} selected` : "No moments yet"}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="ghost" onClick={() => onStepChange("invite")}><ArrowLeft /> Back</Button>
                <Button disabled={!selected.length || submitted} onClick={async () => { if (!onSubmit || await onSubmit(selected)) setSubmitted(true) }}>
                  {submitted ? <>Choices sent <Check /></> : "Send my choices"}
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 justify-between gap-4 text-sm"><span className="shrink-0 text-muted-foreground">{label}</span><strong className="min-w-0 text-right">{value}</strong></div>
}
