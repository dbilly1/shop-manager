"use client"

import React, { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useBranch } from "@/hooks/useBranch"
import { formatCurrency } from "@/utils/format"
import { canAutoApproveAdjustments } from "@/lib/permissions"
import { DateRangeFilter } from "@/components/shared/date-range-filter"
import { ExportButtons, exportCSV, exportXLSX } from "./history-client"
import type { SessionContext } from "@/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { logAuditAction } from "@/lib/audit-action"

// ─── Types ────────────────────────────────────────────────────────────────────

interface RestockRow {
  id: string; created_at: string; product_id: string; product_name: string; unit_type: string
  quantity_kg: number; quantity_units: number; quantity_boxes: number
  cost_per_unit: number; cost_per_box: number | null; units_per_box_at_restock: number | null
  supplier: string | null; notes: string | null; recorded_by_name: string | null
}

interface AdjustRow {
  id: string; created_at: string; product_id: string; product_name: string; unit_type: string
  adjustment_type: string; quantity: number; reason: string
  notes: string | null; adjuster_name: string | null; status: string
}

interface AuditItem {
  id: string; product_id: string; product_name: string; unit_type: string
  system_stock: number; physical_count: number; is_adjusted: boolean; adjustment_id: string | null
}

interface AuditRow {
  id: string; branch_id: string; audit_type: "full" | "partial"; status: "in_progress" | "completed"
  conducted_by_name: string | null; created_at: string; completed_at: string | null
  stock_audit_items: AuditItem[]
}

interface Props {
  session: SessionContext
  branches: { id: string; name: string }[]
  currency: string
  activeBranchId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
function fmtDateOnly(ts: string) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
function fmtStock(v: number, ut: string) {
  return ut === "kg" ? `${v.toFixed(3)} kg` : `${v} units`
}
function boundsOf(start: string, end: string) {
  return { from: `${start}T00:00:00`, to: `${end}T23:59:59` }
}

function Dash() { return <span className="text-muted-foreground/30">—</span> }

// ─── Filter bar shared layout ─────────────────────────────────────────────────

function FilterBar({ start, end, onDateChange, defaultRange, right }: {
  start: string; end: string
  onDateChange: (s: string, e: string) => void
  defaultRange?: [string, string]
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-3 border-b border-border">
      <DateRangeFilter start={start} end={end} onChange={onDateChange} defaultRange={defaultRange} />
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InventoryHistory({ session, branches, currency, activeBranchId }: Props) {
  const [subTab, setSubTab] = useState<"restocks" | "adjustments" | "audits" | "loss">("restocks")

  const { selectedBranchId } = useBranch()
  const branchId = session.branch_id ?? selectedBranchId ?? activeBranchId

  const SUB_TABS = [
    { key: "restocks",     label: "Restocks" },
    { key: "adjustments",  label: "Adjustments" },
    { key: "audits",       label: "Stock Audits" },
    { key: "loss",         label: "Loss Analysis" },
  ] as const

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 px-4 md:px-6 border-b border-border">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              subTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "restocks"    && <RestocksTab    session={session} branchId={branchId} currency={currency} />}
      {subTab === "adjustments" && <AdjustmentsTab session={session} branchId={branchId} currency={currency} />}
      {subTab === "audits"      && <StockAuditsTab session={session} branchId={branchId} currency={currency} branches={branches} />}
      {subTab === "loss"        && <LossAnalysisTab session={session} branchId={branchId} currency={currency} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// RESTOCKS TAB
// ═══════════════════════════════════════════════════════════════════

function RestocksTab({ session, branchId, currency }: { session: SessionContext; branchId: string | null; currency: string }) {
  const [start, setStart] = useState(today)
  const [end,   setEnd]   = useState(today)
  const [rows, setRows]       = useState<RestockRow[]>([])
  const [allRows, setAllRows] = useState<RestockRow[]>([])
  const [loading, setLoading] = useState(false)
  const fc = (n: number) => formatCurrency(n, currency)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      let q = supabase
        .from("restocks")
        .select("id, created_at, product_id, quantity_kg, quantity_units, quantity_boxes, cost_per_unit, cost_per_box, units_per_box_at_restock, supplier, notes, recorded_by_name, product:products(name, unit_type)")
        .eq("shop_id", session.shop_id!)
        .order("created_at", { ascending: true })
      if (branchId) q = q.eq("branch_id", branchId)
      const { data: allData } = await q
      if (!cancelled && allData) {
        const mapped = (allData as unknown as { id: string; created_at: string; product_id: string; quantity_kg: number; quantity_units: number; quantity_boxes: number; cost_per_unit: number; cost_per_box: number | null; units_per_box_at_restock: number | null; supplier: string | null; notes: string | null; recorded_by_name: string | null; product: { name: string; unit_type: string } | null }[]).map((r) => ({
          ...r, product_name: r.product?.name ?? "Unknown", unit_type: r.product?.unit_type ?? "units",
        }))
        setAllRows(mapped)
        const { from, to } = boundsOf(start, end)
        setRows(mapped.filter((r) => r.created_at >= from && r.created_at <= to))
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [start, end, branchId, session.shop_id])

  function vsPrev(row: RestockRow): number | null {
    if (!row.cost_per_box) return null
    const prev = [...allRows].filter((r) => r.product_id === row.product_id && r.created_at < row.created_at && r.cost_per_box).pop()
    if (!prev?.cost_per_box) return null
    return row.cost_per_box - prev.cost_per_box
  }

  const totalCost = rows.reduce((s, r) => {
    const qty = r.unit_type === "kg" ? r.quantity_kg : r.quantity_units
    return s + (r.cost_per_box && (r.quantity_boxes ?? 0) > 0 ? r.cost_per_box * r.quantity_boxes : r.cost_per_unit * qty)
  }, 0)

  function csvData() {
    return rows.map((r) => {
      const qty = r.unit_type === "kg" ? r.quantity_kg : r.quantity_units
      const boxes = r.quantity_boxes ?? 0
      const diff = vsPrev(r)
      return {
        Date: fmtDate(r.created_at), Product: r.product_name,
        "Qty Added": fmtStock(qty, r.unit_type), Boxes: boxes > 0 ? boxes : "",
        "Cost/Box": r.cost_per_box ?? "", "vs Previous": diff != null ? diff.toFixed(2) : "",
        "Cost/Unit": r.cost_per_unit,
        "Total Cost": r.cost_per_box && boxes > 0 ? (r.cost_per_box * boxes).toFixed(2) : (r.cost_per_unit * qty).toFixed(2),
        Supplier: r.supplier ?? "", Notes: r.notes ?? "", "Added By": r.recorded_by_name ?? "",
      }
    })
  }

  return (
    <>
      <FilterBar
        start={start} end={end} onDateChange={(s, e) => { setStart(s); setEnd(e) }} defaultRange={[today(), today()]}
        right={<ExportButtons onCSV={() => exportCSV(csvData(), `restocks-${start}-to-${end}.csv`)} onXLSX={() => exportXLSX(csvData() as Record<string, unknown>[], `restocks-${start}-to-${end}.xlsx`)} />}
      />
      <div className="px-4 md:px-6 pt-4 pb-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-4">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Restocks</p>
            <p className="text-2xl font-bold mt-1">{rows.length}</p>
            <p className="text-sm text-muted-foreground mt-0.5">in selected period</p>
          </div>
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">Total Cost</p>
            <p className="text-2xl font-bold mt-1">{fc(totalCost)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">across all restocks</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No restocks in this period</div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    {["Date","Product","Qty Added","Boxes","Cost/Box","vs Previous","Cost/Unit","Total Cost","Supplier","Notes","Added By"].map((h) => (
                      <th key={h} className={`px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap ${["Date","Product","Supplier","Notes","Added By"].includes(h) ? "text-left" : "text-right"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const qty   = r.unit_type === "kg" ? r.quantity_kg : r.quantity_units
                    const boxes = r.quantity_boxes ?? 0
                    const total = r.cost_per_box && boxes > 0 ? r.cost_per_box * boxes : r.cost_per_unit * qty
                    const diff  = vsPrev(r)
                    return (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-2.5 font-medium">{r.product_name}</td>
                        <td className="px-3 py-2.5 text-right">{fmtStock(qty, r.unit_type)}</td>
                        <td className="px-3 py-2.5 text-right">{boxes > 0 ? boxes : <Dash />}</td>
                        <td className="px-3 py-2.5 text-right">{r.cost_per_box ? fc(r.cost_per_box) : <Dash />}</td>
                        <td className="px-3 py-2.5 text-right">
                          {diff == null ? <Dash /> : (
                            <span className={diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-muted-foreground"}>
                              {diff > 0 ? "+" : ""}{fc(diff)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{fc(r.cost_per_unit)}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{fc(total)}</td>
                        <td className="px-3 py-2.5">{r.supplier ?? <Dash />}</td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{r.notes ?? <Dash />}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.recorded_by_name ?? <Dash />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// ADJUSTMENTS TAB
// ═══════════════════════════════════════════════════════════════════

function AdjustmentsTab({ session, branchId, currency }: { session: SessionContext; branchId: string | null; currency: string }) {
  const [start, setStart] = useState(today)
  const [end,   setEnd]   = useState(today)
  const [rows, setRows]   = useState<AdjustRow[]>([])
  const [loading, setLoading] = useState(false)
  const fc = (n: number) => formatCurrency(n, currency)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { from, to } = boundsOf(start, end)
      let q = supabase
        .from("stock_adjustments")
        .select("id, created_at, product_id, adjustment_type, quantity, reason, notes, adjuster_name, status, product:products(name, unit_type)")
        .eq("shop_id", session.shop_id!)
        .gte("created_at", from).lte("created_at", to)
        .order("created_at", { ascending: false })
      if (branchId) q = q.eq("branch_id", branchId)
      const { data } = await q
      if (!cancelled && data)
        setRows((data as unknown as { id: string; created_at: string; product_id: string; adjustment_type: string; quantity: number; reason: string; notes: string | null; adjuster_name: string | null; status: string; product: { name: string; unit_type: string } | null }[]).map((r) => ({
          ...r, product_name: r.product?.name ?? "Unknown", unit_type: r.product?.unit_type ?? "units",
        })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [start, end, branchId, session.shop_id])

  const totalAdded   = rows.filter((r) => r.adjustment_type === "increase").reduce((s, r) => s + r.quantity, 0)
  const totalRemoved = rows.filter((r) => r.adjustment_type === "decrease").reduce((s, r) => s + r.quantity, 0)

  function csvData() {
    return rows.map((r) => ({
      Date: fmtDate(r.created_at), Product: r.product_name,
      "Qty Change": `${r.adjustment_type === "increase" ? "+" : "-"}${r.quantity}`,
      Type: r.adjustment_type, Reason: r.reason.replace(/_/g, " "),
      Status: r.status, Notes: r.notes ?? "", By: r.adjuster_name ?? "",
    }))
  }

  return (
    <>
      <FilterBar
        start={start} end={end} onDateChange={(s, e) => { setStart(s); setEnd(e) }} defaultRange={[today(), today()]}
        right={<ExportButtons onCSV={() => exportCSV(csvData(), `adjustments-${start}-to-${end}.csv`)} onXLSX={() => exportXLSX(csvData() as Record<string, unknown>[], `adjustments-${start}-to-${end}.xlsx`)} />}
      />
      <div className="px-4 md:px-6 pt-4 pb-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-4">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Adjustments</p>
            <p className="text-2xl font-bold mt-1">{rows.length}</p>
            <p className="text-sm text-muted-foreground mt-0.5">in selected period</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">Net Movement</p>
            <p className="text-2xl font-bold mt-1">
              <span className="text-green-600">+{totalAdded.toFixed(2)}</span>
              {" / "}
              <span className="text-red-600">-{totalRemoved.toFixed(2)}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">added / removed</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No adjustments in this period</div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    {["Date","Product","Qty Change","Type","Reason","Status","Notes","By"].map((h) => (
                      <th key={h} className={`px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap ${["Date","Product","Reason","Notes","By"].includes(h) ? "text-left" : "text-center"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const isIncrease = r.adjustment_type === "increase"
                    return (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-2.5 font-medium">{r.product_name}</td>
                        <td className={`px-3 py-2.5 text-center font-medium ${isIncrease ? "text-green-600" : "text-red-600"}`}>
                          {isIncrease ? "+" : "-"}{fmtStock(r.quantity, r.unit_type)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isIncrease ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {isIncrease ? "Increase" : "Decrease"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">{r.reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] truncate">{r.notes ?? <Dash />}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.adjuster_name ?? <Dash />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// STOCK AUDITS TAB
// ═══════════════════════════════════════════════════════════════════

function StockAuditsTab({ session, branchId, currency, branches }: { session: SessionContext; branchId: string | null; currency: string; branches: { id: string; name: string }[] }) {
  const [start, setStart] = useState(today)
  const [end,   setEnd]   = useState(today)
  const [audits, setAudits]     = useState<AuditRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [adjustItem, setAdjustItem] = useState<{ item: AuditItem; audit: AuditRow } | null>(null)
  const [adjustNotes, setAdjustNotes] = useState("")
  const [adjusting, setAdjusting] = useState(false)

  const canAdjust = canAutoApproveAdjustments(session.role!)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { from, to } = boundsOf(start, end)
      let q = supabase
        .from("stock_audits")
        .select(`id, branch_id, audit_type, status, conducted_by_name, created_at, completed_at,
          stock_audit_items(id, product_id, system_stock, physical_count, is_adjusted, adjustment_id,
            product:products(name, unit_type))`)
        .eq("shop_id", session.shop_id!)
        .gte("created_at", from).lte("created_at", to)
        .order("created_at", { ascending: false })
      if (branchId) q = q.eq("branch_id", branchId)
      const { data } = await q
      if (!cancelled && data)
        setAudits((data as unknown as { id: string; branch_id: string; audit_type: "full" | "partial"; status: "in_progress" | "completed"; conducted_by_name: string | null; created_at: string; completed_at: string | null; stock_audit_items: { id: string; product_id: string; system_stock: number; physical_count: number; is_adjusted: boolean; adjustment_id: string | null; product: { name: string; unit_type: string } | null }[] }[]).map((a) => ({
          ...a,
          stock_audit_items: a.stock_audit_items.map((i) => ({ ...i, product_name: i.product?.name ?? "Unknown", unit_type: i.product?.unit_type ?? "units" })),
        })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [start, end, branchId, session.shop_id])

  const totalVarianceItems = useMemo(
    () => audits.reduce((s, a) => s + a.stock_audit_items.filter((i) => i.physical_count !== i.system_stock).length, 0),
    [audits]
  )

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function openAdjust(item: AuditItem, audit: AuditRow) {
    const variance = item.physical_count - item.system_stock
    setAdjustNotes(`Audit variance adjustment — audit date ${fmtDateOnly(audit.created_at)} (system: ${fmtStock(item.system_stock, item.unit_type)}, physical: ${fmtStock(item.physical_count, item.unit_type)})`)
    setAdjustItem({ item, audit })
  }

  async function applyAdjust() {
    if (!adjustItem) return
    setAdjusting(true)
    const { item, audit } = adjustItem
    const variance = item.physical_count - item.system_stock
    const supabase = createClient()

    const { data: adj, error: adjErr } = await supabase
      .from("stock_adjustments")
      .insert({
        shop_id: session.shop_id, branch_id: audit.branch_id, product_id: item.product_id,
        adjustment_type: variance > 0 ? "increase" : "decrease",
        quantity: Math.abs(variance), reason: "recount_correction",
        notes: adjustNotes || null,
        adjusted_by: session.user_id, adjuster_name: session.full_name ?? null,
        approved_by: session.user_id, status: "approved",
      })
      .select().single()

    if (adjErr || !adj) { toast.error(adjErr?.message ?? "Failed"); setAdjusting(false); return }

    const stockCol = item.unit_type === "kg" ? "current_stock_kg" : "current_stock_units"
    const { data: bp } = await supabase
      .from("branch_products")
      .select(`id, ${stockCol}`)
      .eq("branch_id", audit.branch_id).eq("product_id", item.product_id).single()

    if (bp) {
      const current  = (bp as Record<string, number>)[stockCol] ?? 0
      const newStock = variance > 0 ? current + Math.abs(variance) : Math.max(0, current - Math.abs(variance))
      await supabase.from("branch_products").update({ [stockCol]: newStock }).eq("id", bp.id)
    }

    await supabase.from("stock_audit_items").update({ is_adjusted: true, adjustment_id: adj.id }).eq("id", item.id)

    void logAuditAction({
      branchId: audit.branch_id, action: "CREATE_ADJUSTMENT", entityType: "stock_adjustment", entityId: adj.id,
      newValues: { adjustment_type: variance > 0 ? "increase" : "decrease", quantity: Math.abs(variance), reason: "recount_correction", status: "approved", source: "stock_audit" },
    })

    setAudits((prev) => prev.map((a) =>
      a.id === audit.id
        ? { ...a, stock_audit_items: a.stock_audit_items.map((i) => i.id === item.id ? { ...i, is_adjusted: true, adjustment_id: adj.id } : i) }
        : a
    ))
    toast.success("Adjustment applied")
    setAdjusting(false)
    setAdjustItem(null)
  }

  function csvData() {
    return audits.flatMap((a) => a.stock_audit_items.map((i) => ({
      "Audit Date": fmtDateOnly(a.created_at), "Audit Type": a.audit_type,
      Status: a.status, "Conducted By": a.conducted_by_name ?? "",
      Product: i.product_name,
      "System Stock": fmtStock(i.system_stock, i.unit_type),
      "Physical Count": fmtStock(i.physical_count, i.unit_type),
      Variance: fmtStock(i.physical_count - i.system_stock, i.unit_type),
      Adjusted: i.is_adjusted ? "Yes" : "No",
    })))
  }

  return (
    <>
      <FilterBar
        start={start} end={end} onDateChange={(s, e) => { setStart(s); setEnd(e) }} defaultRange={[today(), today()]}
        right={<ExportButtons onCSV={() => exportCSV(csvData(), `stock-audits-${start}-to-${end}.csv`)} onXLSX={() => exportXLSX(csvData() as Record<string, unknown>[], `stock-audits-${start}-to-${end}.xlsx`)} />}
      />
      <div className="px-4 md:px-6 pt-4 pb-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-4">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Audits</p>
            <p className="text-2xl font-bold mt-1">{audits.length}</p>
            <p className="text-sm text-muted-foreground mt-0.5">in selected period</p>
          </div>
          <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-4">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Items With Variance</p>
            <p className="text-2xl font-bold mt-1">{totalVarianceItems}</p>
            <p className="text-sm text-muted-foreground mt-0.5">across all audits</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading…</div>
        ) : audits.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No audits in this period</div>
        ) : (
          <div className="space-y-3">
            {audits.map((audit) => {
              const isOpen = expanded.has(audit.id)
              const items  = [...audit.stock_audit_items].sort((a, b) => a.product_name.localeCompare(b.product_name))
              const losses = items.filter((i) => i.physical_count < i.system_stock).length
              const gains  = items.filter((i) => i.physical_count > i.system_stock).length
              return (
                <div key={audit.id} className="rounded-lg border overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => toggleExpand(audit.id)}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="font-medium text-sm">{fmtDateOnly(audit.created_at)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${audit.audit_type === "full" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {audit.audit_type === "full" ? "Full" : "Partial"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${audit.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {audit.status === "completed" ? "Completed" : "In Progress"}
                    </span>
                    {audit.conducted_by_name && <span className="text-sm text-muted-foreground">{audit.conducted_by_name}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {items.length} items
                      {losses > 0 && <span className="text-red-500"> · {losses} loss</span>}
                      {gains  > 0 && <span className="text-green-600"> · {gains} gain</span>}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm border-t">
                      <thead>
                        <tr className="border-b bg-muted/10">
                          {["Product","System Stock","Physical Count","Variance","OK?","Action"].map((h) => (
                            <th key={h} className={`px-4 py-2 text-xs font-medium text-muted-foreground ${["Action","OK?"].includes(h) ? "text-center" : h === "Product" ? "text-left" : "text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((item) => {
                          const variance = item.physical_count - item.system_stock
                          const isOk = variance === 0
                          return (
                            <tr key={item.id} className={`${!isOk && variance < 0 ? "bg-red-50/30 dark:bg-red-950/10" : !isOk && variance > 0 ? "bg-green-50/30 dark:bg-green-950/10" : ""}`}>
                              <td className="px-4 py-2.5 font-medium">{item.product_name}</td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtStock(item.system_stock, item.unit_type)}</td>
                              <td className="px-4 py-2.5 text-right">{fmtStock(item.physical_count, item.unit_type)}</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${variance > 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                {variance > 0 ? "+" : ""}{fmtStock(variance, item.unit_type)}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {isOk ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {!isOk && !item.is_adjusted && canAdjust ? (
                                  <button onClick={() => openAdjust(item, audit)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-input bg-background text-xs font-medium hover:bg-muted transition-colors">
                                    <SlidersHorizontal className="h-3 w-3" /> Adjust
                                  </button>
                                ) : item.is_adjusted ? (
                                  <span className="text-xs text-muted-foreground">Adjusted</span>
                                ) : <Dash />}
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
        )}
      </div>

      {/* Adjust dialog */}
      <Dialog open={!!adjustItem} onOpenChange={(o) => { if (!o) setAdjustItem(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Adjust Stock from Audit Variance
            </DialogTitle>
          </DialogHeader>
          {adjustItem && (() => {
            const { item } = adjustItem
            const variance = item.physical_count - item.system_stock
            return (
              <div className="space-y-4 mt-2">
                <div className="rounded-md bg-muted/40 px-4 py-3">
                  <p className="font-semibold">{item.product_name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{item.unit_type}</p>
                </div>
                <div className={`rounded-md px-4 py-3 ${variance > 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                  <p className={`text-xs font-medium ${variance > 0 ? "text-green-600" : "text-red-600"}`}>Stock Adjustment</p>
                  <p className={`text-xl font-bold mt-0.5 ${variance > 0 ? "text-green-600" : "text-red-600"}`}>
                    {variance > 0 ? "+" : ""}{fmtStock(variance, item.unit_type)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Reason: Measurement Variance (pre-approved — audit verified)</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea rows={3} value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setAdjustItem(null)} disabled={adjusting}>Cancel</Button>
                  <Button className="flex-1" onClick={applyAdjust} disabled={adjusting}>
                    {adjusting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Apply Adjustment
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// LOSS ANALYSIS TAB
// ═══════════════════════════════════════════════════════════════════

interface LossProduct {
  product_id: string; name: string; unit_type: string
  net_variance: number; cost_per_unit: number; estimated_value: number
  events: { audit_date: string; system_stock: number; physical_count: number; variance: number }[]
}

function LossAnalysisTab({ session, branchId, currency }: { session: SessionContext; branchId: string | null; currency: string }) {
  const [start, setStart] = useState(today)
  const [end,   setEnd]   = useState(today)
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<LossProduct[]>([])
  const [filter, setFilter]   = useState<"all" | "loss" | "gain">("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const fc = (n: number) => formatCurrency(n, currency)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { from, to } = boundsOf(start, end)
      let q = supabase
        .from("stock_audits")
        .select(`id, created_at, stock_audit_items(product_id, system_stock, physical_count, product:products(name, unit_type, cost_price))`)
        .eq("shop_id", session.shop_id!).eq("status", "completed")
        .gte("created_at", from).lte("created_at", to)
        .order("created_at", { ascending: true })
      if (branchId) q = q.eq("branch_id", branchId)
      const { data } = await q
      if (!cancelled && data) {
        const map = new Map<string, LossProduct>()
        for (const audit of data as unknown as { id: string; created_at: string; stock_audit_items: { product_id: string; system_stock: number; physical_count: number; product: { name: string; unit_type: string; cost_price: number } | null }[] }[]) {
          for (const item of audit.stock_audit_items) {
            const variance = item.physical_count - item.system_stock
            if (variance === 0) continue
            const p = map.get(item.product_id) ?? { product_id: item.product_id, name: item.product?.name ?? "Unknown", unit_type: item.product?.unit_type ?? "units", net_variance: 0, cost_per_unit: item.product?.cost_price ?? 0, estimated_value: 0, events: [] }
            p.net_variance   += variance
            p.estimated_value = p.net_variance * p.cost_per_unit
            p.events.push({ audit_date: fmtDateOnly(audit.created_at), system_stock: item.system_stock, physical_count: item.physical_count, variance })
            map.set(item.product_id, p)
          }
        }
        setProducts([...map.values()].sort((a, b) => Math.abs(b.estimated_value) - Math.abs(a.estimated_value)))
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [start, end, branchId, session.shop_id])

  const displayed = useMemo(() => {
    if (filter === "loss") return products.filter((p) => p.net_variance < 0)
    if (filter === "gain") return products.filter((p) => p.net_variance > 0)
    return products
  }, [products, filter])

  const estLoss   = products.filter((p) => p.estimated_value < 0).reduce((s, p) => s + Math.abs(p.estimated_value), 0)
  const estGain   = products.filter((p) => p.estimated_value > 0).reduce((s, p) => s + p.estimated_value, 0)
  const lossProds = products.filter((p) => p.net_variance < 0).length
  const gainProds = products.filter((p) => p.net_variance > 0).length

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function csvData() {
    return displayed.map((p) => ({
      Product: p.name, "Unit Type": p.unit_type,
      "Net Variance": `${p.net_variance > 0 ? "+" : ""}${p.net_variance.toFixed(3)} ${p.unit_type}`,
      "Cost/Unit": p.cost_per_unit, "Est. Value Impact": p.estimated_value.toFixed(2), Events: p.events.length,
    }))
  }

  return (
    <>
      <FilterBar
        start={start} end={end} onDateChange={(s, e) => { setStart(s); setEnd(e) }} defaultRange={[today(), today()]}
        right={<ExportButtons onCSV={() => exportCSV(csvData(), `loss-analysis-${start}-to-${end}.csv`)} onXLSX={() => exportXLSX(csvData() as Record<string, unknown>[], `loss-analysis-${start}-to-${end}.xlsx`)} />}
      />
      <div className="px-4 md:px-6 pt-4 pb-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-4">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Est. Loss</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{fc(estLoss)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{lossProds} products</p>
          </div>
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">Est. Gain</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{fc(estGain)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{gainProds} products</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filter === "all" ? "all variance events" : filter === "loss" ? "losses only" : "gains only"}
          </p>
          <div className="flex rounded border border-border overflow-hidden">
            {(["loss","gain","all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-primary"}`}>
                {f === "all" ? "Loss + Gain" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No variance events in this period</div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-8" />
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Unit</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Net Variance</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Cost / Unit</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Est. Value</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((p) => {
                  const isOpen = expanded.has(p.product_id)
                  const isLoss = p.net_variance < 0
                  const varColor = isLoss ? "text-red-600" : "text-green-600"
                  return (
                    <React.Fragment key={p.product_id}>
                      {/* Product summary row */}
                      <tr
                        className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => toggleExpand(p.product_id)}
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{p.unit_type}</td>
                        <td className={`px-4 py-3 text-right font-medium ${varColor}`}>
                          {p.net_variance > 0 ? "+" : ""}{p.net_variance.toFixed(3)} {p.unit_type}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {fc(p.cost_per_unit)} / {p.unit_type}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${varColor}`}>
                          {isLoss ? "- " : "+ "}{fc(Math.abs(p.estimated_value))}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            · {p.events.length} {p.events.length === 1 ? (isLoss ? "loss" : "gain") : isLoss ? "losses" : "gains"}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded detail rows */}
                      {isOpen && (
                        <tr className="border-b">
                          <td colSpan={6} className="bg-muted/5 p-0">
                            {/* Section label */}
                            <p className={`px-6 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide ${isLoss ? "text-red-600" : "text-green-600"}`}>
                              {isLoss ? "Loss" : "Gain"} Events ({p.events.length})
                            </p>
                            {/* Detail table */}
                            <table className="w-full text-sm border-t">
                              <thead>
                                <tr className="border-b bg-muted/10">
                                  <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground">Audit Date</th>
                                  <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground">System</th>
                                  <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground">Physical</th>
                                  <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground">{isLoss ? "Loss" : "Gain"}</th>
                                  <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground">Est. Cost</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {p.events.map((ev, i) => {
                                  const evColor = ev.variance > 0 ? "text-green-600" : "text-red-600"
                                  const evCost  = Math.abs(ev.variance) * p.cost_per_unit
                                  return (
                                    <tr key={i} className="hover:bg-muted/10">
                                      <td className="px-6 py-2.5 text-muted-foreground">{ev.audit_date}</td>
                                      <td className="px-6 py-2.5 text-right">{fmtStock(ev.system_stock, p.unit_type)}</td>
                                      <td className="px-6 py-2.5 text-right">{fmtStock(ev.physical_count, p.unit_type)}</td>
                                      <td className={`px-6 py-2.5 text-right font-medium ${evColor}`}>
                                        {ev.variance > 0 ? "+" : ""}{fmtStock(ev.variance, p.unit_type)}
                                      </td>
                                      <td className={`px-6 py-2.5 text-right font-medium ${evColor}`}>
                                        {ev.variance > 0 ? "+ " : "- "}{fc(evCost)}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
