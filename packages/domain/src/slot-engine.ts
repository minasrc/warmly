import { Temporal } from "@js-temporal/polyfill"
import type {
  BusyInterval,
  CandidateRequest,
  CandidateSlot,
  Daypart,
  ParticipantAvailability,
  CandidateWindow,
} from "./contracts"

const MAX_WINDOW_DAYS = 62
const MAX_PARTICIPANTS = 50

export function candidateQueryRange(window: CandidateWindow) {
  const start = Temporal.PlainDate
    .from(window.startDate)
    .toPlainDateTime(Temporal.PlainTime.from(window.dayStart))
    .toZonedDateTime(window.timeZone)
    .toInstant()
  const end = Temporal.PlainDate
    .from(window.endDate)
    .toPlainDateTime(Temporal.PlainTime.from(window.dayEnd))
    .toZonedDateTime(window.timeZone)
    .toInstant()
  return { timeMin: start.toString(), timeMax: end.toString() }
}

export function computeCandidateSlots(request: CandidateRequest): CandidateSlot[] {
  validateRequest(request)
  const { window, durationMinutes, participants, quorum } = request
  const startDate = Temporal.PlainDate.from(window.startDate)
  const endDate = Temporal.PlainDate.from(window.endDate)
  const startTime = Temporal.PlainTime.from(window.dayStart)
  const endTime = Temporal.PlainTime.from(window.dayEnd)
  const duration = Temporal.Duration.from({ minutes: durationMinutes })
  const increment = Temporal.Duration.from({ minutes: window.incrementMinutes })
  const slots = new Map<string, CandidateSlot>()

  for (let date = startDate; Temporal.PlainDate.compare(date, endDate) <= 0; date = date.add({ days: 1 })) {
    const localStart = date.toPlainDateTime(startTime).toZonedDateTime(window.timeZone)
    const localEnd = date.toPlainDateTime(endTime).toZonedDateTime(window.timeZone)

    for (let cursor = localStart; Temporal.ZonedDateTime.compare(cursor.add(duration), localEnd) <= 0; cursor = cursor.add(increment)) {
      if (window.allowedDayparts?.length && !window.allowedDayparts.includes(daypartForHour(cursor.hour))) continue
      const start = cursor.toInstant()
      const end = cursor.add(duration).toInstant()
      const availableParticipantIds = participants
        .filter((participant) => isAvailable(participant, start, end))
        .map((participant) => participant.participantId)

      if (availableParticipantIds.length < quorum) continue
      const key = start.toString()
      slots.set(key, {
        start: key,
        end: end.toString(),
        timeZone: window.timeZone,
        availableParticipantIds,
        unavailableCount: participants.length - availableParticipantIds.length,
        score: scoreCandidate(cursor, participants, availableParticipantIds),
      })
    }
  }

  return [...slots.values()].sort((left, right) => right.score - left.score || left.start.localeCompare(right.start))
}

function isAvailable(
  participant: ParticipantAvailability,
  candidateStart: Temporal.Instant,
  candidateEnd: Temporal.Instant,
) {
  return !participant.busy.some((interval) => overlaps(interval, candidateStart, candidateEnd))
}

function overlaps(interval: BusyInterval, candidateStart: Temporal.Instant, candidateEnd: Temporal.Instant) {
  const busyStart = Temporal.Instant.from(interval.start)
  const busyEnd = Temporal.Instant.from(interval.end)
  return Temporal.Instant.compare(busyStart, candidateEnd) < 0
    && Temporal.Instant.compare(busyEnd, candidateStart) > 0
}

function scoreCandidate(
  localStart: Temporal.ZonedDateTime,
  participants: ParticipantAvailability[],
  availableParticipantIds: string[],
) {
  const available = new Set(availableParticipantIds)
  const availabilityScore = Math.round((available.size / participants.length) * 1000)
  const daypart = daypartForHour(localStart.hour)
  const preferenceScore = participants.reduce((score, participant) => {
    if (!available.has(participant.participantId)) return score
    if (!participant.preferredDayparts?.length) return score + 1
    return score + (participant.preferredDayparts.includes(daypart) ? 5 : 0)
  }, 0)
  return availabilityScore + preferenceScore
}

function daypartForHour(hour: number): Daypart {
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}

function validateRequest({ window, durationMinutes, participants, quorum }: CandidateRequest) {
  const startDate = Temporal.PlainDate.from(window.startDate)
  const endDate = Temporal.PlainDate.from(window.endDate)
  const startTime = Temporal.PlainTime.from(window.dayStart)
  const endTime = Temporal.PlainTime.from(window.dayEnd)
  const days = startDate.until(endDate).days

  if (days < 0 || days >= MAX_WINDOW_DAYS) throw new RangeError("Date window must be between 1 and 62 days")
  if (Temporal.PlainTime.compare(startTime, endTime) >= 0) throw new RangeError("dayStart must be before dayEnd")
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 1440) throw new RangeError("Invalid duration")
  if (!Number.isInteger(window.incrementMinutes) || window.incrementMinutes < 5 || window.incrementMinutes > 120) throw new RangeError("Invalid increment")
  if (!participants.length || participants.length > MAX_PARTICIPANTS) throw new RangeError("Invalid participant count")
  if (!Number.isInteger(quorum) || quorum < 1 || quorum > participants.length) throw new RangeError("Invalid quorum")

  for (const participant of participants) {
    for (const interval of participant.busy) {
      if (Temporal.Instant.compare(Temporal.Instant.from(interval.start), Temporal.Instant.from(interval.end)) >= 0) {
        throw new RangeError("Busy interval start must precede end")
      }
    }
  }
}
