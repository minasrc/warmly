export type PlanStatus = "draft" | "collecting" | "ready" | "booked" | "cancelled"
export type MembershipRole = "host" | "participant"
export type MembershipStatus = "invited" | "ready" | "removed"
export type Daypart = "morning" | "afternoon" | "evening"

export type BusyInterval = {
  start: string
  end: string
}

export type ParticipantAvailability = {
  participantId: string
  busy: BusyInterval[]
  preferredDayparts?: Daypart[]
}

export type CandidateWindow = {
  startDate: string
  endDate: string
  timeZone: string
  dayStart: string
  dayEnd: string
  incrementMinutes: number
}

export type CandidateRequest = {
  window: CandidateWindow
  durationMinutes: number
  quorum: number
  participants: ParticipantAvailability[]
}

export type CandidateSlot = {
  start: string
  end: string
  timeZone: string
  availableParticipantIds: string[]
  unavailableCount: number
  score: number
}

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "provider_error"
  | "rate_limited"
  | "temporarily_unavailable"
  | "internal_error"

export type ApiError = {
  error: {
    code: ApiErrorCode
    message: string
    requestId: string
  }
}
