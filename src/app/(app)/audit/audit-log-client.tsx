"use client"

import { useState, useMemo } from "react"
import { ChevronRight, ChevronDown, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AuditLog } from "@/types"

interface Props {
  logs: AuditLog[]
}

const ACTION_COLORS: Record<string, string> = {
  CREATE_SALE:           "bg-green-100 text-green-800",
  DELETE_SALE:           "bg-red-100 text-red-800",
  EDIT_SALE:             "bg-yellow-100 text-yellow-800",
  CREATE_PRODUCT:        "bg-blue-100 text-blue-800",
  UPDATE_PRODUCT:        "bg-sky-100 text-sky-800",
  ADD_STOCK:             "bg-teal-100 text-teal-800",
  CREATE_ADJUSTMENT:     "bg-amber-100 text-amber-800",
  APPROVE_ADJUSTMENT:    "bg-lime-100 text-lime-800",
  SUBMIT_RECONCILIATION: "bg-purple-100 text-purple-800",
  COMPLETE_AUDIT:        "bg-indigo-100 text-indigo-800",
  CREATE_EXPENSE:        "bg-orange-100 text-orange-800",
  ADD_CUSTOMER:          "bg-cyan-100 text-cyan-800",
  RECORD_CREDIT_PAYMENT: "bg-cyan-50 text-cyan-700",
}

function toDateKey(isoString: string): string {
  // Returns "YYYY-MM-DD" in local time
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function todayKey(): string {
  return toDateKey(new Date().toISOString())
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toDateKey(d.toISOString())
}

function formatDayLabel(dateKey: string): string {
  const today = todayKey()
  const yesterday = yesterdayKey()
  if (dateKey === today) return "Today"
  if (dateKey === yesterday) return "Yesterday"
  // Parse as local date to avoid UTC shift
  const [y, m, day] = dateKey.split("-").map(Number)
  const d = new Date(y, m - 1, day)
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface DayGroup {
  dateKey: string
  label: string
  entries: AuditLog[]
}

export function AuditLogClient({ logs }: Props) {
  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, AuditLog[]>()
    for (const log of logs) {
      const key = toDateKey(log.created_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(log)
    }
    // Sort groups: most recent date first
    const sorted = Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
    return sorted.map(([dateKey, entries]) => ({
      dateKey,
      label: formatDayLabel(dateKey),
      entries,
    }))
  }, [logs])

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    // Expand first 2 groups by default; groups are derived from logs which
    // may not be available at hook init time — use indices
    groups.slice(0, 2).forEach((g) => initial.add(g.dateKey))
    return initial
  })

  function toggleGroup(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  if (logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <Clock className="h-8 w-8" />
          <p className="text-sm">No activity recorded yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-3">
      {/* Heading */}
      <div className="mb-2">
        <h1 className="text-xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground text-sm">Activity history for your shop</p>
      </div>

      {/* Day groups */}
      {groups.map((group) => {
        const isExpanded = expandedKeys.has(group.dateKey)
        return (
          <div key={group.dateKey} className="bg-white border rounded-lg overflow-hidden">
            {/* Day header */}
            <div
              className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => toggleGroup(group.dateKey)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              )}
              <span className="font-medium text-sm">{group.label}</span>
              <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs text-slate-600">
                {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            {/* Entry table */}
            {isExpanded && (
              <div className="border-t overflow-x-auto">
                <table className="text-sm w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Time</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">User</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Action</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Entity</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.entries.map((log) => {
                      const colorClass = ACTION_COLORS[log.action] ?? "bg-slate-100 text-slate-700"
                      const detailsRaw = log.new_values ? JSON.stringify(log.new_values) : ""
                      const details =
                        detailsRaw.length > 60 ? detailsRaw.slice(0, 60) + "…" : detailsRaw

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                            {formatTime(log.created_at)}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                            {log.user_id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <Badge className={`text-xs border-0 ${colorClass}`}>
                              {log.action.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                            {toTitleCase(log.entity_type)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 font-mono max-w-xs truncate">
                            {details}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
