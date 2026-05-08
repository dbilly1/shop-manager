"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import type { SessionContext } from "@/types"
import { logAuditAction } from "@/lib/audit-action"
import {
  ClipboardCheck, Plus, Loader2, AlertTriangle,
  CheckCircle2, ChevronLeft, CircleCheck,
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────

const VARIANCE_THRESHOLD_PCT = 5

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditItem {
  id: string
  product_id: string
  product: { name: string; unit_type: string; units_per_box: number | null; audit_threshold_pct: number | null } | null
  system_stock: number
  physical_count: number
  is_adjusted: boolean
  adjustment_id: string | null
}

interface StockAudit {
  id: string
  branch_id: string
  audit_type: "full" | "partial"
  status: "in_progress" | "completed"
  notes: string | null
  conducted_by_name: string | null
  completed_at: string | null
  created_at: string
  stock_audit_items: AuditItem[]
}

interface BranchProduct {
  id: string
  branch_id: string
  current_stock_kg: number
  current_stock_units: number
  product: { id: string; name: string; unit_type: string; units_per_box: number | null } | null
}

interface Props {
  audits: StockAudit[]
  branchProducts: BranchProduct[]
  branches: { id: string; name: string }[]
  session: SessionContext
  currency: string
  activeBranchId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSystemStock(bp: BranchProduct): number {
  return bp.product?.unit_type === "kg" ? bp.current_stock_kg : bp.current_stock_units
}

function fmtStock(value: number, unitType: string): string {
  return unitType === "kg" ? `${value.toFixed(3)} kg` : `${value} units`
}

function variancePct(variance: number, systemStock: number): number | null {
  if (systemStock === 0) return null
  return Math.abs(variance / systemStock) * 100
}

type ItemStatus = "matched" | "within" | "flagged"

function getItemStatus(variance: number, systemStock: number, thresholdPct?: number | null): ItemStatus {
  if (variance === 0) return "matched"
  const pct = variancePct(variance, systemStock)
  if (pct === null) return "flagged"
  const limit = thresholdPct ?? VARIANCE_THRESHOLD_PCT
  return pct <= limit ? "within" : "flagged"
}

function physicalCountFromInputs(
  qty: number,
  boxes: number,
  unitsPerBox: number | null,
): number {
  return qty + (unitsPerBox ? boxes * unitsPerBox : 0)
}

function auditSummary(items: AuditItem[], physCounts?: Record<string, number>) {
  let ok = 0, flagged = 0
  for (const item of items) {
    const phys = physCounts ? (physCounts[item.id] ?? item.physical_count) : item.physical_count
    const s = getItemStatus(phys - item.system_stock, item.system_stock, item.product?.audit_threshold_pct)
    if (s === "flagged") flagged++; else ok++
  }
  return { ok, flagged }
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ItemStatus }) {
  if (status === "matched") return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-3.5 w-3.5" /> Matched
    </span>
  )
  if (status === "within") return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
      ✓ Within Threshold
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      <AlertTriangle className="h-3 w-3" /> Flagged
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StockAuditsClient({
  audits: initialAudits,
  branchProducts,
  branches,
  session,
  activeBranchId,
}: Props) {
  const router = useRouter()
  const [audits, setAudits] = useState<StockAudit[]>(initialAudits)

  // ─── View state ───────────────────────────────────────────────────
  // "list"     → audit list table
  // "counting" → in-page audit entry / results view
  const [view, setView] = useState<"list" | "counting">("list")
  const [activeAudit, setActiveAudit] = useState<StockAudit | null>(null)

  // Per-item count inputs (split into qty + boxes for conversion)
  const [countQty, setCountQty]     = useState<Record<string, number>>({})
  const [countBoxes, setCountBoxes] = useState<Record<string, number>>({})

  const [savingCounts, setSavingCounts]       = useState(false)
  const [completingAudit, setCompletingAudit] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [cancellingAudit, setCancellingAudit] = useState(false)

  // ─── New Audit dialog ─────────────────────────────────────────────
  const [newOpen, setNewOpen]         = useState(false)
  const [newType, setNewType]         = useState<"full" | "partial">("full")
  const [selectedPids, setSelectedPids] = useState<string[]>([])
  const [newNotes, setNewNotes]       = useState("")
  const [creating, setCreating]       = useState(false)
  const [productSearch, setProductSearch] = useState("")

  const branchId = session.branch_id ?? activeBranchId ?? ""
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—"

  const filteredBps = useMemo(() =>
    branchProducts.filter((bp) =>
      bp.product?.name.toLowerCase().includes(productSearch.toLowerCase())
    ), [branchProducts, productSearch])

  // ─── Derived physical counts ──────────────────────────────────────
  function physCount(item: AuditItem): number {
    return physicalCountFromInputs(
      countQty[item.id]   ?? 0,
      countBoxes[item.id] ?? 0,
      item.product?.units_per_box ?? null,
    )
  }

  // ─── Open an existing audit ───────────────────────────────────────
  function openAudit(audit: StockAudit) {
    setActiveAudit(audit)
    // Seed inputs from saved values
    const qty: Record<string, number>   = {}
    const boxes: Record<string, number> = {}
    for (const item of audit.stock_audit_items) {
      qty[item.id]   = item.physical_count
      boxes[item.id] = 0
    }
    setCountQty(qty)
    setCountBoxes(boxes)
    setView("counting")
  }

  // ─── Create audit ─────────────────────────────────────────────────
  async function createAudit() {
    if (!branchId) { toast.error("No branch selected"); return }

    const targetBps = newType === "full"
      ? branchProducts.filter((bp) => !session.branch_id || bp.branch_id === branchId)
      : branchProducts.filter((bp) => selectedPids.includes(bp.product?.id ?? ""))

    if (targetBps.length === 0) { toast.error("No products to audit"); return }

    setCreating(true)
    const supabase = createClient()

    const { data: newAudit, error: auditErr } = await supabase
      .from("stock_audits")
      .insert({
        shop_id:           session.shop_id,
        branch_id:         branchId,
        audit_type:        newType,
        status:            "in_progress",
        notes:             newNotes || null,
        conducted_by:      session.user_id,
        conducted_by_name: session.full_name ?? null,
      })
      .select()
      .single()

    if (auditErr || !newAudit) {
      toast.error(auditErr?.message ?? "Failed to create audit")
      setCreating(false)
      return
    }

    const itemRows = targetBps
      .filter((bp) => bp.product)
      .map((bp) => ({
        audit_id:       newAudit.id,
        shop_id:        session.shop_id,
        branch_id:      branchId,
        product_id:     bp.product!.id,
        system_stock:   getSystemStock(bp),
        physical_count: 0,
      }))

    const { error: itemErr } = await supabase.from("stock_audit_items").insert(itemRows)
    if (itemErr) { toast.error(itemErr.message); setCreating(false); return }

    // Fetch the full audit with items+product so we can open it immediately
    const { data: full } = await supabase
      .from("stock_audits")
      .select(`
        id, branch_id, audit_type, status, notes,
        conducted_by_name, completed_at, created_at,
        stock_audit_items (
          id, product_id, system_stock, physical_count, is_adjusted, adjustment_id,
          product:products(name, unit_type, units_per_box, audit_threshold_pct)
        )
      `)
      .eq("id", newAudit.id)
      .single()

    setCreating(false)
    setNewOpen(false)
    setNewNotes("")
    setSelectedPids([])

    if (full) {
      const typed = full as unknown as StockAudit
      setAudits((prev) => [typed, ...prev])

      // Open counting view immediately — no refresh needed
      const qty: Record<string, number>   = {}
      const bxs: Record<string, number>   = {}
      for (const item of typed.stock_audit_items) { qty[item.id] = 0; bxs[item.id] = 0 }
      setCountQty(qty)
      setCountBoxes(bxs)
      setActiveAudit(typed)
      setView("counting")

      void logAuditAction({
        branchId: typed.branch_id,
        action: "CREATE_STOCK_AUDIT",
        entityType: "stock_audit",
        entityId: typed.id,
        newValues: {
          audit_type: typed.audit_type,
          product_count: typed.stock_audit_items.length,
          notes: typed.notes ?? null,
        },
      })
    }
  }

  // ─── Save counts ──────────────────────────────────────────────────
  async function saveCounts() {
    if (!activeAudit) return
    setSavingCounts(true)
    const supabase = createClient()

    for (const item of activeAudit.stock_audit_items) {
      await supabase
        .from("stock_audit_items")
        .update({ physical_count: physCount(item) })
        .eq("id", item.id)
    }

    // Sync local audit state
    const updated = {
      ...activeAudit,
      stock_audit_items: activeAudit.stock_audit_items.map((item) => ({
        ...item, physical_count: physCount(item),
      })),
    }
    setActiveAudit(updated)
    setAudits((prev) => prev.map((a) => a.id === updated.id ? updated : a))
    setSavingCounts(false)
    toast.success("Counts saved")
  }

  // ─── Complete audit ───────────────────────────────────────────────
  async function completeAudit() {
    if (!activeAudit) return
    setCompletingAudit(true)
    const supabase = createClient()

    // Save latest counts first
    for (const item of activeAudit.stock_audit_items) {
      await supabase
        .from("stock_audit_items")
        .update({ physical_count: physCount(item) })
        .eq("id", item.id)
    }

    const { error } = await supabase
      .from("stock_audits")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", activeAudit.id)

    if (error) { toast.error(error.message); setCompletingAudit(false); return }

    const updated: StockAudit = {
      ...activeAudit,
      status: "completed",
      completed_at: new Date().toISOString(),
      stock_audit_items: activeAudit.stock_audit_items.map((item) => ({
        ...item, physical_count: physCount(item),
      })),
    }
    setActiveAudit(updated)
    setAudits((prev) => prev.map((a) => a.id === updated.id ? updated : a))
    setCompletingAudit(false)
    toast.success("Audit completed")

    const { ok, flagged } = auditSummary(updated.stock_audit_items)
    void logAuditAction({
      branchId: updated.branch_id,
      action: "COMPLETE_STOCK_AUDIT",
      entityType: "stock_audit",
      entityId: updated.id,
      newValues: {
        audit_type: updated.audit_type,
        product_count: updated.stock_audit_items.length,
        matched_or_within: ok,
        flagged,
      },
    })
  }

  // ─── Cancel audit ────────────────────────────────────────────────
  async function cancelAudit() {
    if (!activeAudit) return
    setCancellingAudit(true)
    const supabase = createClient()

    // Delete cascades to stock_audit_items via FK
    const { error } = await supabase.from("stock_audits").delete().eq("id", activeAudit.id)
    if (error) { toast.error(error.message); setCancellingAudit(false); return }

    void logAuditAction({
      branchId: activeAudit.branch_id,
      action: "CANCEL_STOCK_AUDIT",
      entityType: "stock_audit",
      entityId: activeAudit.id,
      oldValues: {
        audit_type: activeAudit.audit_type,
        product_count: activeAudit.stock_audit_items.length,
        created_at: activeAudit.created_at,
      },
    })

    setAudits((prev) => prev.filter((a) => a.id !== activeAudit.id))
    setCancellingAudit(false)
    setCancelConfirmOpen(false)
    setView("list")
    setActiveAudit(null)
    toast.success("Audit cancelled")
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── COUNTING / RESULTS VIEW ────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  if (view === "counting" && activeAudit) {
    const isInProgress  = activeAudit.status === "in_progress"
    const sortedItems   = [...activeAudit.stock_audit_items].sort((a, b) =>
      (a.product?.name ?? "").localeCompare(b.product?.name ?? "")
    )
    const countedCount  = isInProgress
      ? sortedItems.filter((i) => (countQty[i.id] ?? 0) > 0 || (countBoxes[i.id] ?? 0) > 0).length
      : sortedItems.filter((i) => i.physical_count > 0).length
    const totalCount    = sortedItems.length

    // For results: compute summary using saved physical_count
    const resultCounts: Record<string, number> = {}
    for (const item of sortedItems) resultCounts[item.id] = physCount(item)
    const { ok: okCount, flagged: flaggedCount } = auditSummary(
      activeAudit.stock_audit_items,
      isInProgress ? resultCounts : undefined,
    )

    return (
      <div className="flex flex-col gap-4">
        {/* ── Top bar ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" className="mt-0.5 -ml-1" onClick={() => { setView("list"); setActiveAudit(null) }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-xl font-bold">
                {activeAudit.audit_type === "full" ? "Full" : "Partial"} Stock Count
              </h1>
              <p className="text-sm text-muted-foreground">
                {isInProgress
                  ? "Enter what you physically count for each product"
                  : `Completed · ${new Date(activeAudit.completed_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isInProgress && (
              <>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setCancelConfirmOpen(true)}>
                  Cancel Audit
                </Button>
                <Button variant="outline" size="sm" onClick={saveCounts} disabled={savingCounts}>
                  {savingCounts && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
                <Button size="sm" onClick={completeAudit} disabled={completingAudit}>
                  {completingAudit
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <CircleCheck className="mr-1.5 h-3.5 w-3.5" />}
                  Complete Audit
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Progress / summary bar ── */}
        <div className="border rounded-lg px-4 py-2.5 flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900">
          {isInProgress ? (
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {countedCount} / {totalCount} counted
            </span>
          ) : (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-600 dark:text-green-400 font-medium">✓ {okCount} OK</span>
              {flaggedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" /> {flaggedCount} Flagged
                </span>
              )}
            </div>
          )}
          {activeAudit.conducted_by_name && (
            <span className="text-xs text-muted-foreground">{activeAudit.conducted_by_name}</span>
          )}
        </div>

        {/* ── Items table ── */}
        <div className="border rounded-lg overflow-auto max-h-[calc(100vh-280px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background border-b">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3 w-[220px]">Product</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-[130px]">System Stock</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Physical Count</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-[120px]">Variance</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3 w-[160px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedItems.map((item) => {
                  const ut  = item.product?.unit_type ?? "units"
                  const upb = item.product?.units_per_box ?? null
                  const phys    = isInProgress ? physCount(item) : item.physical_count
                  const variance = phys - item.system_stock
                  const pct      = variancePct(variance, item.system_stock)
                  const status   = getItemStatus(variance, item.system_stock, item.product?.audit_threshold_pct)
                  const isCounted = isInProgress
                    ? (countQty[item.id] ?? 0) > 0 || (countBoxes[item.id] ?? 0) > 0
                    : item.physical_count > 0

                  return (
                    <tr key={item.id} className={`
                      ${!isInProgress && status === "flagged" ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}
                      hover:bg-muted/20 transition-colors
                    `}>
                      {/* Product */}
                      <td className="px-5 py-3">
                        <span className="font-medium">{item.product?.name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground capitalize mt-0.5">{ut}</span>
                      </td>

                      {/* System stock */}
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {fmtStock(item.system_stock, ut)}
                      </td>

                      {/* Physical count — dual inputs (qty + boxes) */}
                      <td className="px-4 py-3">
                        {isInProgress ? (
                          <div className="flex items-center gap-2">
                            {/* Primary qty input */}
                            <Input
                              type="number"
                              min={0}
                              step={ut === "kg" ? "0.001" : "1"}
                              value={countQty[item.id] ?? 0}
                              onChange={(e) => setCountQty((prev) => ({
                                ...prev, [item.id]: parseFloat(e.target.value) || 0,
                              }))}
                              className="h-8 w-28 text-right tabular-nums"
                            />
                            <span className="text-xs text-muted-foreground shrink-0">{ut === "kg" ? "kg" : "units"}</span>

                            {/* Box input — only for box-enabled products */}
                            {upb ? (
                              <>
                                <Input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={countBoxes[item.id] ?? 0}
                                  onChange={(e) => setCountBoxes((prev) => ({
                                    ...prev, [item.id]: parseFloat(e.target.value) || 0,
                                  }))}
                                  className="h-8 w-20 text-right tabular-nums"
                                />
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {(countBoxes[item.id] ?? 0) > 0
                                    ? `boxes = ${fmtStock((countBoxes[item.id] ?? 0) * upb, ut)}`
                                    : "boxes"}
                                </span>
                              </>
                            ) : null}
                          </div>
                        ) : (
                          <span className="tabular-nums">{fmtStock(item.physical_count, ut)}</span>
                        )}
                      </td>

                      {/* Variance */}
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                        !isCounted && isInProgress ? "text-muted-foreground" :
                        variance === 0 ? "text-muted-foreground" :
                        variance > 0   ? "text-blue-600 dark:text-blue-400" :
                                         "text-red-600 dark:text-red-400"
                      }`}>
                        {(!isCounted && isInProgress)
                          ? "—"
                          : variance === 0
                            ? `0 ${ut === "kg" ? "kg" : "u"}`
                            : `${variance > 0 ? "+" : ""}${variance.toFixed(ut === "kg" ? 3 : 0)} ${ut === "kg" ? "kg" : "u"}`}
                        {!isInProgress && pct !== null && pct > 0 && (
                          <span className="block text-xs font-normal opacity-70">{pct.toFixed(1)}%</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3 text-right">
                        {(!isCounted && isInProgress)
                          ? <span className="text-muted-foreground">—</span>
                          : <StatusPill status={status} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>

        {/* ── Cancel Confirm Dialog ── */}
        <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel this audit?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">
              This will permanently delete the audit and all counts entered so far. This cannot be undone.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setCancelConfirmOpen(false)}>
                Keep Audit
              </Button>
              <Button variant="destructive" className="flex-1" onClick={cancelAudit} disabled={cancellingAudit}>
                {cancellingAudit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Yes, Cancel Audit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── LIST VIEW ──────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Stock Audits</h1>
          <p className="text-sm text-muted-foreground">
            Compare physical counts against system stock · variance threshold: {VARIANCE_THRESHOLD_PCT}%
          </p>
        </div>
        <Button onClick={() => { setNewOpen(true); setNewType("full"); setSelectedPids([]); setNewNotes("") }}>
          <Plus className="mr-2 h-4 w-4" />
          New Audit
        </Button>
      </div>

      {/* Audit list */}
      {audits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No audits yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first audit to compare physical stock against system records.
          </p>
          <Button className="mt-4" onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Audit
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Date</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5">Type</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5">Conducted By</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5">Result</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5">Status</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {audits.map((audit) => {
                const { ok, flagged } = auditSummary(audit.stock_audit_items)
                const date = new Date(audit.created_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })
                const isInProgress = audit.status === "in_progress"

                return (
                  <tr
                    key={audit.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => openAudit(audit)}
                  >
                    <td className="px-4 py-3 font-medium">{date}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="text-xs">
                        {audit.audit_type === "full" ? "Full" : "Partial"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {audit.conducted_by_name ?? "—"}
                      {!session.branch_id && (
                        <span className="ml-1.5 text-xs opacity-60">{branchName(audit.branch_id)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {ok > 0 && <span className="text-xs text-green-600 dark:text-green-400">✓ {ok} OK</span>}
                        {flagged > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> {flagged} Flagged
                          </span>
                        )}
                        {ok === 0 && flagged === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={isInProgress
                        ? "text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300"
                        : "text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300"}>
                        {isInProgress ? "In Progress" : "Completed"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New Audit Dialog ── */}
      <Dialog open={newOpen} onOpenChange={(v) => { setNewOpen(v); if (!v) { setSelectedPids([]); setProductSearch("") } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> New Stock Audit
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            {/* Type */}
            <div className="space-y-2">
              <Label>Audit Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["full", "partial"] as const).map((t) => (
                  <button key={t}
                    onClick={() => { setNewType(t); setSelectedPids([]) }}
                    className={`rounded-md border px-4 py-2.5 text-sm text-left transition-colors ${
                      newType === t ? "bg-foreground text-background border-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <span className="block font-semibold capitalize">{t}</span>
                    <span className="block text-xs mt-0.5 opacity-70 font-normal">
                      {t === "full" ? "All products in branch" : "Select specific products"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Product selection for partial */}
            {newType === "partial" && (
              <div className="space-y-2">
                <Label>Select Products <span className="text-destructive">*</span></Label>
                <Input placeholder="Search products…" value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)} className="h-8" />
                <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                  {filteredBps.length === 0 && (
                    <p className="text-sm text-muted-foreground p-3">No products found</p>
                  )}
                  {filteredBps.map((bp) => bp.product && (
                    <label key={bp.product.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={selectedPids.includes(bp.product.id)}
                        onCheckedChange={(checked) =>
                          setSelectedPids((prev) =>
                            checked ? [...prev, bp.product!.id] : prev.filter((id) => id !== bp.product!.id)
                          )
                        }
                      />
                      <span className="text-sm flex-1">{bp.product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmtStock(getSystemStock(bp), bp.product.unit_type)}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedPids.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedPids.length} product(s) selected</p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Any notes about this audit…" rows={2} className="resize-none" />
            </div>

            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              Current stock levels are snapshotted when the audit is created. You'll enter physical counts immediately after.
            </p>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createAudit}
                disabled={creating || (newType === "partial" && selectedPids.length === 0)}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create & Start Counting
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
