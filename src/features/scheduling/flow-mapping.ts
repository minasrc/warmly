import { parseDate } from "@internationalized/date"
import type { CandidateMoment, Daypart } from "@warmly/domain"
import type { OwnResponse, PlanRecord, PlanPeople } from "@/services/api-types"
import type { PlanState } from "./host-flow"
import { dateRangeError, personFromEmail, type MomentView, type Person } from "./model"

export function planInput(plan: PlanState, timeZone: string) {
  const invalidRange = dateRangeError(plan.dateRange)
  if (invalidRange) throw new RangeError(invalidRange)
  return {
    name: plan.name.trim(),
    startDate: plan.dateRange.start.toString(),
    endDate: plan.dateRange.end.toString(),
    durationMinutes: plan.duration,
    timeZone,
    dayStart: "08:00",
    dayEnd: "22:00",
    quorum: 1,
    requireAll: true,
    allowedDayparts: plan.dayparts.filter((value) => value !== "Any time").map((value) => value.toLowerCase() as Daypart),
  }
}

export function planState(plan: PlanRecord): PlanState {
  return {
    activityId: "custom",
    name: plan.name,
    duration: plan.duration_minutes,
    dateRange: { start: parseDate(plan.start_date), end: parseDate(plan.end_date) },
    dayparts: plan.allowed_dayparts.length ? plan.allowed_dayparts.map((value) => value[0].toUpperCase() + value.slice(1)) : ["Any time"],
  }
}

export function momentViews(candidates: CandidateMoment[]): MomentView[] {
  return candidates.map((candidate) => {
    const start = new Date(candidate.start)
    return {
      id: candidate.start,
      startsAt: candidate.start,
      endsAt: candidate.end,
      day: new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: candidate.timeZone }).format(start),
      time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: candidate.timeZone }).format(start),
      note: candidate.unavailableCount === 0 ? "Everyone sharing availability is free" : `${candidate.availableCount} people are free`,
    }
  })
}

export function peopleViews(result: PlanPeople, previous: Person[] = []): Person[] {
  return [
    ...result.people.map((member) => ({
      ...personFromEmail(member.email)!,
      userId: member.userId,
      name: member.status === "host" ? "You" : member.name ?? personFromEmail(member.email)!.name,
      status: member.status,
    })),
    ...result.invitations.map((invitation) => ({
      ...personFromEmail(invitation.email)!,
      invitationId: invitation.id,
      inviteUrl: previous.find((person) => person.invitationId === invitation.id)?.inviteUrl,
    })),
  ]
}

export function choiceSlots(moments: MomentView[], selectedIds: string[]) {
  if (!selectedIds.length || selectedIds.length > 50 || new Set(selectedIds).size !== selectedIds.length) throw new RangeError("Choose between 1 and 50 different moments")
  return selectedIds.map((id) => {
    const moment = moments.find((candidate) => candidate.id === id)
    if (!moment?.startsAt || !moment.endsAt) throw new RangeError("A selected moment is no longer available")
    return { startsAt: moment.startsAt, endsAt: moment.endsAt }
  })
}

export function responseState(moments: MomentView[], response: OwnResponse) {
  const selected = moments.filter((moment) => response.slots.some((slot) =>
    Date.parse(slot.startsAt) === Date.parse(moment.startsAt ?? "") && Date.parse(slot.endsAt) === Date.parse(moment.endsAt ?? ""),
  )).map((moment) => moment.id)
  return { selected, submitted: !!response.submittedAt && selected.length === response.slots.length && selected.length > 0 }
}
