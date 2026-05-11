"use client"

import { useState, useMemo, Fragment } from "react"
import { ChevronRight, ChevronDown, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AuditLog } from "@/types"

interface Props {
  logs: AuditLog[]
  userNames: Record<string, string>
  branchNames: Record<string, string>
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
  CREATE_TRANSFER:       "bg-violet-100 text-violet-800",
  APPROVE_TRANSFER:      "bg-purple-100 text-purple-800",
  SUBMIT_RECONCILIATION: "bg-indigo-100 text-indigo-800",
  CREATE_EXPENSE:        "bg-orange-100 text-orange-800",
  ADD_CUSTOMER:          "bg-cyan-100 text-cyan-800",
  CREATE_BRANCH:         "bg-rose-100 text-rose-800",
  RECORD_CREDIT_PAYMENT: "bg-cyan-50 text-cyan-700",
}

// Actions that carry both before and after values worth comparing
const EDIT_ACTIONS = new Set(["EDIT_SALE", "UPDATE_PRODUCT", "APPROVE_ADJUSTMENT", "APPROVE_TRANSFER"])

function toDateKey(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function todayKey() { return toDateKey(new Date().toISOString()) }
function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1); return toDateKey(d.toISOString())
}

function formatDayLabel(dateKey: string): string {
  const today = todayKey(), yesterday = yesterdayKey()
  if (dateKey === today) return "Today"
  if (dateKey === yesterday) return "Yesterday"
  const [y, m, day] = dateKey.split("-").map(Number)
  return new Date(y, m - 1, day).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function toTitleCase(str: string): string {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function JsonBlock({ data, label, color }: { data: Record<string, unknown>; label: string; color: "green" | "red" | "slate" }) {
  const palette = {
    green: "bg-green-50 border-green-200 text-green-900",
    red:   "bg-red-50 border-red-200 text-red-900",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  }
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <pre className={`text-xs rounded-md border px-3 py-2 font-mono overflow-x-auto whitespace-pre-wrap break-all ${palette[color]}`}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

interface DayGroup { dateKey: string; label: string; entries: AuditLog[] }

export function AuditLogClient({ logs, userNames, branchNames }: Props) {
  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, AuditLog[]>()
    for (const log of logs) {
      const key = toDateKey(log.created_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(log)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, entries]) => ({ dateKey, label: formatDayLabel(dateKey), entries }))
  }, [logs])

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const s = new Set<string>()
    groups.slice(0, 2).forEach((g) => s.add(g.dateKey))
    return s
  })
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }
  function toggleRow(id: string) {
    setExpandedRow((prev) => (prev === id ? null : id))
  }

  if (logs.length === 0) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <Clock className="h-8 w-8" />
          <p className="text-sm">No activity recorded yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.dateKey)
        return (
          <div key={group.dateKey} className="bg-white border rounded-lg overflow-hidden">
            {/* Day header */}
            <div
              className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
              onClick={() => toggleGroup(group.dateKey)}
            >
              {isExpanded
                ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
              <span className="font-medium text-sm">{group.label}</span>
              <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs text-slate-600">
                {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            {/* Entry table */}
            {isExpanded && (
              <div className="border-t overflow-x-auto">
                <table className="text-sm w-full min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Time</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">User</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Action</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Entity</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Branch</th>
                      <th className="px-4 py-2 text-xs font-medium text-slate-500 w-full">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.entries.map((log) => {
                      const colorClass = ACTION_COLORS[log.action] ?? "bg-slate-100 text-slate-700"
                      const isRowExpanded = expandedRow === log.id
                      const isEdit = EDIT_ACTIONS.has(log.action)
                      // Summary line: for edits show old→new, otherwise show new_values
                      const detailsRaw = log.new_values ? JSON.stringify(log.new_values) : "—"

                      return (
                        <Fragment key={log.id}>
                          <tr
                            className={`cursor-pointer transition-colors ${isRowExpanded ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
                            onClick={() => toggleRow(log.id)}
                          >
                            <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                              {formatTime(log.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                              {userNames[log.user_id] ?? log.user_id.slice(0, 8)}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <Badge className={`text-xs border-0 ${colorClass}`}>
                                {log.action.replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                              {toTitleCase(log.entity_type)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                              {log.branch_id ? (branchNames[log.branch_id] ?? "—") : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 font-mono max-w-0 w-full">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate">{detailsRaw}</span>
                                <ChevronDown
                                  className={`h-3 w-3 text-slate-300 shrink-0 transition-transform ${isRowExpanded ? "rotate-180" : ""}`}
                                />
                              </div>
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {isRowExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={6} className="px-6 py-4">
                                {isEdit && log.old_values && log.new_values ? (
                                  // Before / After comparison for edits
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <JsonBlock data={log.old_values} label="Before" color="red" />
                                    <JsonBlock data={log.new_values} label="After" color="green" />
                                  </div>
                                ) : (
                                  // Single details panel for creates / approvals / etc.
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {log.new_values && (
                                      <JsonBlock data={log.new_values} label="Details" color="green" />
                                    )}
                                    {log.old_values && (
                                      <JsonBlock data={log.old_values} label="Previous" color="red" />
                                    )}
                                    {!log.new_values && !log.old_values && (
                                      <p className="text-xs text-slate-400 italic">No value details recorded.</p>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
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
