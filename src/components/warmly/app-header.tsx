import type { ReactNode } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Wordmark } from "./brand"

type AppHeaderProps = {
  dark: boolean
  onDarkChange: (dark: boolean) => void
  children?: ReactNode
}

export function StandaloneAppHeader(props: AppHeaderProps) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-7 sm:py-7"><AppHeader {...props} /></div>
}

export function AppHeader({ dark, onDarkChange, children }: AppHeaderProps) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-3">
      <Wordmark />
      <div className="flex min-w-0 items-center gap-3">
        {children}
        <Button variant="ghost" size="icon" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => onDarkChange(!dark)}>
          {dark ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  )
}
