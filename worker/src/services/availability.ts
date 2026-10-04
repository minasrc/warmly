import {
  candidateQueryRange,
  computeCandidateSlots,
  type CandidateRequest,
  type ParticipantAvailability,
} from "@warmly/domain"
import type { CalendarProvider } from "../calendar/provider"

export type ConnectedParticipant = {
  participantId: string
  accessToken: string
  calendarIds: string[]
  preferredDayparts?: ParticipantAvailability["preferredDayparts"]
}

export async function findAggregateCandidates(
  provider: CalendarProvider,
  request: Omit<CandidateRequest, "participants">,
  participants: ConnectedParticipant[],
) {
  const { timeMin, timeMax } = candidateQueryRange(request.window)
  const availability = await Promise.all(participants.map(async (participant) => {
    const calendars = await provider.queryFreeBusy({
      accessToken: participant.accessToken,
      calendarIds: participant.calendarIds,
      timeMin,
      timeMax,
      timeZone: request.window.timeZone,
    })
    return {
      participantId: participant.participantId,
      busy: Object.values(calendars).flat(),
      ...(participant.preferredDayparts ? { preferredDayparts: participant.preferredDayparts } : {}),
    }
  }))

  return computeCandidateSlots({ ...request, participants: availability })
}
