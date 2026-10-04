import { motion } from "motion/react"
import { Heart } from "lucide-react"

export function Wordmark() {
  return (
    <span className="font-heading text-xl font-semibold tracking-tight text-primary">
      warmly
    </span>
  )
}

export function PrivacyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Heart className="size-3.5 fill-primary/15 text-primary" aria-hidden />
      {children}
    </p>
  )
}

export function FriendPortraits() {
  return (
    <div className="flex items-end justify-center -space-x-3" aria-label="A group of friends">
      <svg viewBox="0 0 72 72" className="relative z-10 size-20" role="img" aria-label="Friend with a high bun">
        <circle cx="36" cy="36" r="33" fill="var(--color-secondary)" />
        <circle cx="37" cy="17" r="11" fill="#49373d" />
        <path d="M19 38c0-16 8-25 18-25s18 9 18 25v18H19z" fill="#49373d" />
        <ellipse cx="37" cy="42" rx="14" ry="17" fill="#c98268" />
        <path d="M23 36c2-12 8-18 16-18 7 0 12 5 15 14-9-1-18-4-25-9-3 4-5 8-6 13z" fill="#49373d" />
        <path d="M49 31c-2 7-3 13-2 20" fill="none" stroke="#49373d" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 72 72" className="size-20" role="img" aria-label="Friend with short dark hair">
        <circle cx="36" cy="36" r="33" fill="#dfe7df" />
        <path d="M20 37c0-15 6-25 16-25s17 10 17 25v19H20z" fill="#3c3a42" />
        <ellipse cx="36" cy="42" rx="14" ry="17" fill="#b96f55" />
        <path d="M23 33c1-12 6-18 14-18 7 0 12 5 14 14-9 0-18-2-28-7z" fill="#3c3a42" />
      </svg>
      <svg viewBox="0 0 72 72" className="relative z-10 size-20" role="img" aria-label="Friend with blonde hair">
        <circle cx="36" cy="36" r="33" fill="#f0e5d6" />
        <path d="M19 38c0-17 7-26 18-26s18 9 18 26v19H19z" fill="#d9ad55" />
        <ellipse cx="36" cy="42" rx="14" ry="17" fill="#e2aa8b" />
        <path d="M22 36c0-13 6-21 16-21 7 0 12 4 15 12-10-1-19-4-27-9-2 5-4 11-4 18z" fill="#d9ad55" />
      </svg>
    </div>
  )
}

export function Journey({ progress }: { progress: number }) {
  return (
    <svg viewBox="0 0 190 74" className="h-16 w-44 text-primary/50" aria-hidden>
      <path
        d="M5 52C31 12 55 70 79 40s43-33 61-7c12 17 29 17 44-8"
        fill="none"
        stroke="currentColor"
        strokeDasharray="2 7"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <motion.path
        d="M5 52C31 12 55 70 79 40s43-33 61-7c12 17 29 17 44-8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        initial={false}
        animate={{ pathLength: progress }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <motion.g
        initial={false}
        animate={{ opacity: progress === 1 ? 1 : 0.65 }}
        transition={{ duration: 0.3 }}
        transform="translate(171 12)"
      >
        <path d="M2 12c6-7 11-8 16-7-4 2-6 5-7 9 4-2 7-2 10-1-6 3-11 4-16 2z" fill="currentColor" />
      </motion.g>
    </svg>
  )
}
