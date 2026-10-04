import type { ReactNode } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Wordmark } from "./brand"

export function AppHeader({ dark, onDarkChange, children }: {
  dark: boolean
  onDarkChange: (dark: boolean) => void
  children?: ReactNode
}) {
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
