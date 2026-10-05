import {
  candidateQueryRange,
  computeCandidateSlots,
  type CandidateRequest,
  type ParticipantAvailability,
} from "@warmly/domain"
import type { CalendarProvider } from "../calendar/provider"

export type ConnectedParticipant = {
  participantId: string
  connections: Array<{
    accessToken: string
    calendarIds: string[]
  }>
  preferredDayparts?: ParticipantAvailability["preferredDayparts"]
}

export async function findAggregateCandidates(
  provider: CalendarProvider,
  request: Omit<CandidateRequest, "participants">,
  participants: ConnectedParticipant[],
) {
  const { timeMin, timeMax } = candidateQueryRange(request.window)
  const availability = await Promise.all(participants.map(async (participant) => {
    let busy = [{ start: timeMin, end: timeMax }]
    if (participant.connections.length) {
      try {
        const calendars = await Promise.all(participant.connections.map((connection) =>
          provider.queryFreeBusy({
            accessToken: connection.accessToken,
            calendarIds: connection.calendarIds,
            timeMin,
            timeMax,
            timeZone: request.window.timeZone,
          }),
        ))
        busy = calendars.flatMap((result) => Object.values(result).flat())
      } catch {
        // A partial result could expose a false free slot, so this participant is conservatively unavailable.
      }
    }
    return {
      participantId: participant.participantId,
      busy,
      ...(participant.preferredDayparts ? { preferredDayparts: participant.preferredDayparts } : {}),
    }
  }))

  return computeCandidateSlots({ ...request, participants: availability })
}
