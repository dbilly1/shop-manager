"use client"

import { useState } from "react"
import { SalesHistory } from "./sales-history"
import { InventoryHistory } from "./inventory-history"
import type { SessionContext } from "@/types"

// ─── Shared export helpers (used by child tabs) ───────────────────────────────

export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = String(r[h] ?? "")
          return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
        })
        .join(",")
    ),
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/csv" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export async function exportXLSX(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const XLSX = await import("xlsx")
  const ws   = XLSX.utils.json_to_sheet(rows)
  const wb   = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  XLSX.writeFile(wb, filename)
}

export function ExportButtons({ onCSV, onXLSX }: { onCSV: () => void; onXLSX: () => void }) {
  return (
    <>
      <button
        onClick={onCSV}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        CSV
      </button>
      <button
        onClick={onXLSX}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
        XLSX
      </button>
    </>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  session: SessionContext
  branches: { id: string; name: string }[]
  currency: string
  activeBranchId: string | null
}

// ─── Main client component ────────────────────────────────────────────────────

export function HistoryClient({ session, branches, currency, activeBranchId }: Props) {
  const [topTab, setTopTab] = useState<"sales" | "inventory">("sales")

  const TABS = [
    { key: "sales",     label: "Sales History" },
    { key: "inventory", label: "Inventory History" },
  ] as const

  return (
    <div className="-m-4 md:-m-6">
      {/* Sticky tab bar */}
      <div className="sticky -top-4 md:-top-6 z-20 bg-background border-b border-border">
        <div className="flex gap-1 px-4 md:px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTopTab(t.key)}
              className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                topTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {topTab === "sales" ? (
        <SalesHistory
          session={session}
          branches={branches}
          currency={currency}
          activeBranchId={activeBranchId}
        />
      ) : (
        <InventoryHistory
          session={session}
          branches={branches}
          currency={currency}
          activeBranchId={activeBranchId}
        />
      )}
    </div>
  )
}
