"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { Announcement } from "@/types"

interface Props {
  announcements: Announcement[]
}

export function AnnouncementBanner({ announcements }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      const stored = localStorage.getItem("dismissed_announcements")
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  function dismiss(id: string) {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    try {
      localStorage.setItem("dismissed_announcements", JSON.stringify([...next]))
    } catch {}
  }

  const visible = announcements.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="border-b bg-foreground text-background">
      {visible.map((a) => (
        <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
          <div className="flex-1 min-w-0">
            <span className="font-medium">{a.title}</span>
            {a.body && <span className="ml-2 opacity-80">{a.body}</span>}
          </div>
          <button
            onClick={() => dismiss(a.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
