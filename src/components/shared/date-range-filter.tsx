"use client"

import { useState } from "react"

export type DatePreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "last_30_days"

interface Props {
  start: string
  end: string
  onChange: (start: string, end: string) => void
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0]
}

function getPresetRange(preset: DatePreset): [string, string] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const today = toISO(now)

  switch (preset) {
    case "today":
      return [today, today]

    case "yesterday": {
      const d = new Date(now)
      d.setDate(d.getDate() - 1)
      const y = toISO(d)
      return [y, y]
    }

    case "this_week": {
      const d = new Date(now)
      const dow = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - dow)
      return [toISO(d), today]
    }

    case "last_week": {
      const d = new Date(now)
      const dow = (d.getDay() + 6) % 7
      const mon = new Date(d)
      mon.setDate(d.getDate() - dow - 7)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return [toISO(mon), toISO(sun)]
    }

    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return [toISO(first), today]
    }

    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return [toISO(first), toISO(last)]
    }

    case "last_30_days": {
      const d = new Date(now)
      d.setDate(d.getDate() - 29)
      return [toISO(d), today]
    }
  }
}

const PRESETS: { label: string; key: DatePreset }[] = [
  { label: "Today", key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "This Week", key: "this_week" },
  { label: "Last Week", key: "last_week" },
  { label: "This Month", key: "this_month" },
  { label: "Last Month", key: "last_month" },
  { label: "Last 30 Days", key: "last_30_days" },
]

export function DateRangeFilter({ start, end, onChange }: Props) {
  const today = toISO(new Date())

  function detectPreset(s: string, e: string): DatePreset | null {
    for (const { key } of PRESETS) {
      const [ps, pe] = getPresetRange(key)
      if (ps === s && pe === e) return key
    }
    return null
  }

  const [activePreset, setActivePreset] = useState<DatePreset | null>(() => detectPreset(start, end))

  function handlePreset(key: DatePreset) {
    const range = getPresetRange(key)
    setActivePreset(key)
    onChange(...range)
  }

  function handleDateInput(newStart: string, newEnd: string) {
    setActivePreset(null)
    onChange(newStart, newEnd)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(({ label, key }) => {
        const selected = activePreset === key
        return (
          <button
            key={key}
            onClick={() => handlePreset(key)}
            className={[
              "rounded border px-3 py-1.5 text-xs font-medium transition-colors",
              selected
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            {label}
          </button>
        )
      })}

      <input
        type="date"
        value={start}
        max={end}
        onChange={(e) => handleDateInput(e.target.value, end)}
        className="h-8 rounded border border-border px-2 text-sm bg-background text-foreground"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <input
        type="date"
        value={end}
        min={start}
        max={today}
        onChange={(e) => handleDateInput(start, e.target.value)}
        className="h-8 rounded border border-border px-2 text-sm bg-background text-foreground"
      />
    </div>
  )
}
