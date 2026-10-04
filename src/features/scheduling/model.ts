import { parseDate, type CalendarDate } from "@internationalized/date"
import type { RangeValue } from "@react-types/shared"

export function dateRangeError(range: RangeValue<CalendarDate>) {
  if (range.end.compare(range.start) < 0) return "The end date must be on or after the start date."
  if (range.end.compare(range.start.add({ days: 61 })) > 0) return "Choose a range of no more than 62 days."
  return null
}

export type HostStep =
  | "sign-in"
  | "calendar"
  | "create"
  | "invite"
  | "moments"
  | "confirm"
  | "success"

export type Activity = {
  id: string
  label: string
  icon: string
  duration: number
}

export type Person = {
  email: string
  name: string
  initials: string
  status: "host" | "invited" | "ready" | "joined"
  inviteUrl?: string
  invitationId?: string
  userId?: string
}

export type MomentView = {
  id: string
  day: string
  time: string
  note: string
  startsAt?: string
  endsAt?: string
}

export const activities: Activity[] = [
  { id: "catch-up", label: "Catch up", icon: "♥", duration: 60 },
  { id: "dinner", label: "Dinner", icon: "✦", duration: 90 },
  { id: "walk", label: "Walk", icon: "↝", duration: 60 },
  { id: "coffee", label: "Coffee", icon: "☕", duration: 45 },
  { id: "game-night", label: "Game night", icon: "◇", duration: 120 },
  { id: "custom", label: "Something else", icon: "+", duration: 60 },
]

export const recentPeople: Person[] = [
  { name: "Maya", email: "maya@example.com", initials: "MA", status: "ready" },
  { name: "Theo", email: "theo@example.com", initials: "TH", status: "ready" },
  { name: "Sam", email: "sam@example.com", initials: "SA", status: "ready" },
]

export const candidateMoments = [
  { id: "thu", day: "Thu, Oct 15", time: "6:30 PM", note: "Everyone is free" },
  { id: "fri", day: "Fri, Oct 16", time: "7:00 PM", note: "Everyone is free" },
  { id: "sun", day: "Sun, Oct 18", time: "11:30 AM", note: "Everyone is free" },
]

export const initialDateRange = {
  start: parseDate("2026-10-12"),
  end: parseDate("2026-10-18"),
}

export const hostSteps: HostStep[] = [
  "sign-in",
  "calendar",
  "create",
  "invite",
  "moments",
  "confirm",
  "success",
]

export function activityPlan(activityId: string) {
  const activity = activities.find((item) => item.id === activityId)
  return activity ? { activityId, name: activity.label, duration: activity.duration } : null
}

export function toggleDaypart(current: string[], daypart: string) {
  if (daypart === "Any time") return ["Any time"]
  const specific = current.filter((item) => item !== "Any time")
  const next = specific.includes(daypart)
    ? specific.filter((item) => item !== daypart)
    : [...specific, daypart]
  return next.length ? next : ["Any time"]
}

export function personFromEmail(email: string): Person | null {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  const rawName = normalized.split("@")[0].replace(/[._-]+/g, " ")
  const name = rawName.replace(/\b\w/g, (letter) => letter.toUpperCase())
  return {
    email: normalized,
    name,
    initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    status: "invited",
  }
}

export function formatDate(date: { toDate: (timeZone: string) => Date }) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date.toDate("UTC"))
}
