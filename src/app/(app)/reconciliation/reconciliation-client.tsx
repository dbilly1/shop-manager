"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/utils/format"
import { toast } from "sonner"
import {
  CalendarDays, CheckCircle2, AlertTriangle, Loader2,
  ChevronRight, Clock, Layers, FileText, Plus, Trash2,
} from "lucide-react"
import type { SessionContext } from "@/types"
import type { ReconRecord } from "./page"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TillExpenseRow {
  description: string
  amount: number
}

interface SessionData {
  sessionType: "direct" | "bulk"
  batchId: string | null
  time: string           // ISO string from earliest sale
  cashSales: number
  mobileSales: number
  creditRepayments: number
  tillExpenses: number   // existing till expenses already in DB
  // form state
  actualCash: string
  actualMobile: string
  notes: string
  newTillExpenses: TillExpenseRow[]
  existingReconId: string | null
  existingStatus: "balanced" | "flagged" | null
}

interface Props {
  reconciliations: ReconRecord[]
  saleDateSessions: { date: string; sessionCount: number }[]
  currency: string
  tolerance: number
  session: SessionContext
  branches: { id: string; name: string }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split("T")[0]
}

function formatDateLabel(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function VarianceLabel({ variance, currency }: { variance: number; currency: string }) {
  if (variance === 0) return <span className="text-xs text-green-600 font-medium">✓ Balanced</span>
  if (variance > 0) return <span className="text-xs text-blue-600 font-medium">+{formatCurrency(variance, currency)} surplus</span>
  return <span className="text-xs text-red-600 font-medium">−{formatCurrency(Math.abs(variance), currency)} shortfall</span>
}

function computeHistoryStatus(
  recons: ReconRecord[],
  sessionCount: number,
): { label: string; color: string } {
  if (recons.length === 0 && sessionCount === 0) return { label: "No sales", color: "text-slate-400" }
  if (recons.length === 0) return { label: "Pending", color: "text-slate-400" }
  if (recons.length < sessionCount) return { label: `Partial ${recons.length}/${sessionCount}`, color: "text-amber-600" }
  const allBalanced = recons.every((r) => r.status === "balanced")
  if (allBalanced) return { label: "Balanced", color: "text-green-600" }
  const cashVars = recons.map((r) => r.cash_variance)
  const mobileVars = recons.map((r) => r.mobile_variance)
  const allNeg = [...cashVars, ...mobileVars].every((v) => v <= 0) && recons.some((r) => r.cash_variance < 0 || r.mobile_variance < 0)
  const allPos = [...cashVars, ...mobileVars].every((v) => v >= 0) && recons.some((r) => r.cash_variance > 0 || r.mobile_variance > 0)
  if (allNeg) return { label: "Shortfall", color: "text-red-600" }
  if (allPos) return { label: "Surplus", color: "text-amber-600" }
  return { label: "Mixed", color: "text-amber-600" }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReconciliationClient({
  reconciliations: initialReconciliations,
  saleDateSessions,
  currency,
  tolerance,
  session,
  branches,
}: Props) {
  const router = useRouter()
  const today = todayISO()
  const branchId = session.branch_id ?? branches[0]?.id ?? null

  const [reconciliations, setReconciliations] = useState<ReconRecord[]>(initialReconciliations)
  const [selectedDate, setSelectedDate] = useState(today)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [submitting, setSubmitting] = useState<number | null>(null)  // index of submitting session

  const isBackdated = selectedDate < today

  // ── Fetch sessions for a date ──────────────────────────────────────────────
  const loadSessions = useCallback(async (date: string) => {
    if (!session.shop_id) return
    setLoadingSessions(true)
    try {
      const supabase = createClient()

      // 1. Sales for the date
      const salesQ = supabase
        .from("sales")
        .select("batch_id, payment_method, total_amount, created_at")
        .eq("shop_id", session.shop_id)
        .eq("sale_date", date)
      if (session.branch_id) salesQ.eq("branch_id", session.branch_id)
      const { data: salesData } = await salesQ

      if (!salesData || salesData.length === 0) {
        setSessions([])
        setLoadingSessions(false)
        return
      }

      // 2. Credit repayments (cash) for the date
      const paymentsQ = supabase
        .from("credit_payments")
        .select("amount")
        .eq("shop_id", session.shop_id)
        .eq("payment_method", "cash")
        .eq("payment_date", date)
      if (session.branch_id) paymentsQ.eq("branch_id", session.branch_id)
      const { data: paymentsData } = await paymentsQ
      const totalCreditRepayments = (paymentsData ?? []).reduce((s, p) => s + p.amount, 0)

      // 3. Till expenses for the date
      const expQ = supabase
        .from("expenses")
        .select("amount, batch_id")
        .eq("shop_id", session.shop_id)
        .eq("expense_date", date)
        .eq("payment_method", "cash")
      if (session.branch_id) expQ.eq("branch_id", session.branch_id)
      const { data: expData } = await expQ

      // Existing reconciliations for this date
      const dateRecons = reconciliations.filter((r) => r.reconciliation_date === date)

      // Group sales by session
      const batchMap = new Map<string | null, typeof salesData>()
      for (const sale of salesData) {
        const key = sale.batch_id ?? null
        if (!batchMap.has(key)) batchMap.set(key, [])
        batchMap.get(key)!.push(sale)
      }

      const built: SessionData[] = []

      // Direct session first
      if (batchMap.has(null)) {
        const directSales = batchMap.get(null)!
        const cashSales = directSales.filter((s) => s.payment_method === "cash").reduce((s, x) => s + x.total_amount, 0)
        const mobileSales = directSales.filter((s) => s.payment_method === "mobile").reduce((s, x) => s + x.total_amount, 0)
        const tillExp = (expData ?? []).filter((e) => e.batch_id == null).reduce((s, e) => s + e.amount, 0)
        const earliest = directSales.reduce((a, b) => a.created_at < b.created_at ? a : b).created_at
        const existing = dateRecons.find((r) => r.batch_id == null) ?? null
        built.push({
          sessionType: "direct",
          batchId: null,
          time: earliest,
          cashSales,
          mobileSales,
          creditRepayments: totalCreditRepayments,
          tillExpenses: tillExp,
          actualCash: existing ? String(existing.actual_cash) : "",
          actualMobile: existing ? String(existing.actual_mobile) : "",
          notes: existing?.notes ?? "",
          newTillExpenses: [],
          existingReconId: existing?.id ?? null,
          existingStatus: existing?.status ?? null,
        })
      }

      // Bulk sessions
      for (const [batchId, batchSales] of batchMap.entries()) {
        if (batchId == null) continue
        const cashSales = batchSales.filter((s) => s.payment_method === "cash").reduce((s, x) => s + x.total_amount, 0)
        const mobileSales = batchSales.filter((s) => s.payment_method === "mobile").reduce((s, x) => s + x.total_amount, 0)
        const tillExp = (expData ?? []).filter((e) => e.batch_id === batchId).reduce((s, e) => s + e.amount, 0)
        const earliest = batchSales.reduce((a, b) => a.created_at < b.created_at ? a : b).created_at
        const existing = dateRecons.find((r) => r.batch_id === batchId) ?? null
        built.push({
          sessionType: "bulk",
          batchId,
          time: earliest,
          cashSales,
          mobileSales,
          creditRepayments: 0,  // credit repayments are tracked at day level, not per batch
          tillExpenses: tillExp,
          actualCash: existing ? String(existing.actual_cash) : "",
          actualMobile: existing ? String(existing.actual_mobile) : "",
          notes: existing?.notes ?? "",
          newTillExpenses: [],
          existingReconId: existing?.id ?? null,
          existingStatus: existing?.status ?? null,
        })
      }

      // Sort: direct first, then bulk by time
      built.sort((a, b) => {
        if (a.sessionType === "direct" && b.sessionType !== "direct") return -1
        if (a.sessionType !== "direct" && b.sessionType === "direct") return 1
        return a.time.localeCompare(b.time)
      })

      setSessions(built)
    } finally {
      setLoadingSessions(false)
    }
  }, [session.shop_id, session.branch_id, reconciliations])

  useEffect(() => {
    loadSessions(selectedDate)
  }, [selectedDate, loadSessions])

  // ── Update a session field ─────────────────────────────────────────────────
  function updateSession(idx: number, patch: Partial<SessionData>) {
    setSessions((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  function addTillExpense(idx: number) {
    setSessions((prev) => prev.map((s, i) =>
      i === idx ? { ...s, newTillExpenses: [...s.newTillExpenses, { description: "", amount: 0 }] } : s
    ))
  }

  function updateTillExpense(sessionIdx: number, expIdx: number, field: "description" | "amount", value: string | number) {
    setSessions((prev) => prev.map((s, i) =>
      i === sessionIdx
        ? { ...s, newTillExpenses: s.newTillExpenses.map((e, j) => j === expIdx ? { ...e, [field]: value } : e) }
        : s
    ))
  }

  function removeTillExpense(sessionIdx: number, expIdx: number) {
    setSessions((prev) => prev.map((s, i) =>
      i === sessionIdx ? { ...s, newTillExpenses: s.newTillExpenses.filter((_, j) => j !== expIdx) } : s
    ))
  }

  // ── Submit a session ───────────────────────────────────────────────────────
  async function submitSession(idx: number) {
    if (!branchId) { toast.error("No branch available"); return }
    const sess = sessions[idx]
    if (sess.actualCash === "" || sess.actualMobile === "") {
      toast.error("Enter both actual cash and mobile amounts")
      return
    }
    setSubmitting(idx)
    try {
      const supabase = createClient()

      // Save new till expenses first
      const validNewExp = sess.newTillExpenses.filter((e) => e.description && e.amount > 0)
      for (const exp of validNewExp) {
        await supabase.from("expenses").insert({
          shop_id: session.shop_id,
          branch_id: branchId,
          expense_date: selectedDate,
          category: "Miscellaneous",
          description: exp.description,
          amount: exp.amount,
          payment_method: "cash",
          batch_id: sess.batchId,
          recorded_by: session.user_id,
          recorded_by_name: session.full_name ?? null,
        })
      }

      const newTillTotal = validNewExp.reduce((s, e) => s + e.amount, 0)
      const totalTillExpenses = sess.tillExpenses + newTillTotal

      const parsedCash = parseFloat(sess.actualCash) || 0
      const parsedMobile = parseFloat(sess.actualMobile) || 0

      const expectedCash = sess.cashSales + sess.creditRepayments - totalTillExpenses
      const expectedMobile = sess.mobileSales

      const cashVariance = parsedCash - expectedCash
      const mobileVariance = parsedMobile - expectedMobile

      const allBalanced =
        Math.abs(cashVariance) <= tolerance && Math.abs(mobileVariance) <= tolerance

      const payload = {
        shop_id: session.shop_id,
        branch_id: branchId,
        reconciliation_date: selectedDate,
        recorded_by: session.user_id,
        session_type: sess.sessionType,
        batch_id: sess.batchId,
        expected_cash: expectedCash,
        actual_cash: parsedCash,
        cash_variance: cashVariance,
        expected_mobile: expectedMobile,
        actual_mobile: parsedMobile,
        mobile_variance: mobileVariance,
        credit_repayments_cash: sess.creditRepayments,
        till_expenses: totalTillExpenses,
        status: allBalanced ? "balanced" as const : "flagged" as const,
        notes: sess.notes.trim() || null,
      }

      // Upsert — the unique indexes handle direct vs bulk separately
      const { data: upserted, error } = await supabase
        .from("reconciliations")
        .upsert(payload, {
          onConflict: sess.batchId
            ? "shop_id,branch_id,reconciliation_date,batch_id"
            : "shop_id,branch_id,reconciliation_date",
        })
        .select()
        .single()

      if (error) { toast.error(error.message); return }

      // Update local state
      setReconciliations((prev) => {
        const exists = prev.some((r) => r.id === upserted.id)
        if (exists) return prev.map((r) => r.id === upserted.id ? upserted as ReconRecord : r)
        return [upserted as ReconRecord, ...prev]
      })

      // Update session status
      updateSession(idx, {
        existingReconId: upserted.id,
        existingStatus: upserted.status as "balanced" | "flagged",
        tillExpenses: totalTillExpenses,
        newTillExpenses: [],
      })

      toast.success(allBalanced ? "Session reconciled — Balanced ✓" : "Session saved — Variance flagged")
      router.refresh()
    } finally {
      setSubmitting(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-[calc(100vh-3.5rem)] -m-4 md:-m-6 overflow-hidden">

      {/* ── LEFT: Session form panel ──────────────────────────────────────── */}
      <div className="overflow-y-auto border-r flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <h2 className="font-semibold text-sm">Reconcile a Day</h2>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Date
            <input
              type="date"
              max={today}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border rounded h-8 px-2 text-sm text-foreground ml-1"
            />
          </label>
        </div>

        {/* Backdated notice */}
        {isBackdated && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded px-3 py-2 flex items-center gap-1.5 shrink-0">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Backdated entry for {formatDateLabel(selectedDate)}
          </div>
        )}

        {/* Sessions */}
        <div className="flex-1 p-6 space-y-4">
          {loadingSessions ? (
            <div className="flex justify-center pt-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm pt-12">
              No sales recorded for this date
            </p>
          ) : (
            sessions.map((sess, idx) => {
              const newTillTotal = sess.newTillExpenses.reduce((s, e) => s + (e.amount || 0), 0)
              const totalTill = sess.tillExpenses + newTillTotal
              const expectedCash = sess.cashSales + sess.creditRepayments - totalTill
              const expectedMobile = sess.mobileSales
              const parsedCash = parseFloat(sess.actualCash) || 0
              const parsedMobile = parseFloat(sess.actualMobile) || 0
              const cashVariance = sess.actualCash !== "" ? parsedCash - expectedCash : null
              const mobileVariance = sess.actualMobile !== "" ? parsedMobile - expectedMobile : null
              const bothFilled = sess.actualCash !== "" && sess.actualMobile !== ""
              const allBalanced = bothFilled &&
                Math.abs(cashVariance!) <= tolerance &&
                Math.abs(mobileVariance!) <= tolerance

              return (
                <div key={sess.batchId ?? "direct"} className="border rounded-lg overflow-hidden">
                  {/* Card header */}
                  <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {sess.sessionType === "direct"
                        ? <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                        : <Layers className="h-4 w-4 text-blue-500 shrink-0" />
                      }
                      <span className="font-semibold text-sm">Session {idx + 1}</span>
                      <span className={`text-xs ${sess.sessionType === "bulk" ? "text-blue-500" : "text-slate-500"}`}>
                        {sess.sessionType === "direct" ? "Direct entries" : "Bulk entry"} · {formatTime(sess.time)}
                      </span>
                    </div>
                    {sess.existingStatus && (
                      sess.existingStatus === "balanced"
                        ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs px-2">Balanced</Badge>
                        : <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs px-2">Mismatch</Badge>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-4 space-y-3">
                    {/* Expected breakdown */}
                    <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Cash Sales</span>
                        <span className="tabular-nums font-medium">{formatCurrency(sess.cashSales, currency)}</span>
                      </div>
                      {sess.creditRepayments > 0 && (
                        <div className="flex justify-between text-purple-600">
                          <span>+ Credit Repayments</span>
                          <span className="tabular-nums font-medium">{formatCurrency(sess.creditRepayments, currency)}</span>
                        </div>
                      )}
                      {totalTill > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>- Till Expenses {newTillTotal > 0 ? "(day)" : ""}</span>
                          <span className="tabular-nums font-medium">− {formatCurrency(totalTill, currency)}</span>
                        </div>
                      )}
                      <div className="border-t pt-1.5 flex justify-between">
                        <span className="font-bold text-slate-900">Expected Cash</span>
                        <span className="tabular-nums font-bold text-slate-900">{formatCurrency(expectedCash, currency)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Mobile Money</span>
                        <span className="tabular-nums">{formatCurrency(expectedMobile, currency)}</span>
                      </div>
                    </div>

                    {/* Actual inputs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">Actual Cash</label>
                        <Input
                          type="number" min={0} step="any" placeholder="0.00"
                          value={sess.actualCash}
                          onChange={(e) => updateSession(idx, { actualCash: e.target.value })}
                          className="h-8 text-sm"
                        />
                        {cashVariance !== null && (
                          <VarianceLabel variance={cashVariance} currency={currency} />
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">Actual Mobile</label>
                        <Input
                          type="number" min={0} step="any" placeholder="0.00"
                          value={sess.actualMobile}
                          onChange={(e) => updateSession(idx, { actualMobile: e.target.value })}
                          className="h-8 text-sm"
                        />
                        {mobileVariance !== null && (
                          <VarianceLabel variance={mobileVariance} currency={currency} />
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    <Input
                      placeholder="Optional explanation..."
                      value={sess.notes}
                      onChange={(e) => updateSession(idx, { notes: e.target.value })}
                      className="h-8 text-sm"
                    />

                    {/* Till expenses (new) */}
                    <div>
                      <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
                        <span>Add expenses paid from till</span>
                        <button
                          onClick={() => addTillExpense(idx)}
                          className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      </div>
                      {sess.newTillExpenses.map((exp, ei) => (
                        <div key={ei} className="flex items-center gap-2 mt-1">
                          <Input
                            placeholder="Description"
                            value={exp.description}
                            onChange={(e) => updateTillExpense(idx, ei, "description", e.target.value)}
                            className="flex-1 h-7 text-xs"
                          />
                          <Input
                            type="number" min={0} step="any" placeholder="0.00"
                            value={exp.amount || ""}
                            onChange={(e) => updateTillExpense(idx, ei, "amount", parseFloat(e.target.value) || 0)}
                            className="w-20 h-7 text-xs"
                          />
                          <button
                            onClick={() => removeTillExpense(idx, ei)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Status banner */}
                    {bothFilled && (
                      allBalanced ? (
                        <div className="flex items-center gap-2 rounded-md border bg-green-50 border-green-200 text-green-800 px-3 py-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span className="font-medium">Balanced</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5 rounded-md border bg-red-50 border-red-200 text-red-800 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="font-medium">Variance detected</span>
                          </div>
                          {cashVariance !== null && Math.abs(cashVariance) > tolerance && (
                            <span className="text-xs pl-6">
                              Cash {cashVariance > 0 ? "surplus" : "shortfall"}: {cashVariance > 0 ? "+" : "−"}{formatCurrency(Math.abs(cashVariance), currency)}
                            </span>
                          )}
                          {mobileVariance !== null && Math.abs(mobileVariance) > tolerance && (
                            <span className="text-xs pl-6">
                              Mobile {mobileVariance > 0 ? "surplus" : "shortfall"}: {mobileVariance > 0 ? "+" : "−"}{formatCurrency(Math.abs(mobileVariance), currency)}
                            </span>
                          )}
                        </div>
                      )
                    )}

                    {/* Submit button */}
                    <Button
                      onClick={() => submitSession(idx)}
                      disabled={submitting === idx}
                      className="w-full h-9"
                    >
                      {submitting === idx && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {sess.existingReconId ? "Update" : "Submit"}
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: History table ──────────────────────────────────────────── */}
      <div className="overflow-y-auto flex flex-col">
        <div className="px-6 py-4 border-b shrink-0">
          <h2 className="font-semibold text-sm">Reconciliation History</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Click a row to load into the editor</p>
        </div>

        {saleDateSessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            No sales recorded yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-center">Sessions</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {saleDateSessions.map(({ date, sessionCount }) => {
                const dateRecons = reconciliations.filter((r) => r.reconciliation_date === date)
                const { label, color } = computeHistoryStatus(dateRecons, sessionCount)
                const isSelected = date === selectedDate
                return (
                  <tr
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`cursor-pointer transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-muted/40"}`}
                  >
                    <td className="px-6 py-3 font-medium whitespace-nowrap">
                      {formatDateLabel(date)}
                      {date === today && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Today</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{sessionCount}</td>
                    <td className={`px-4 py-3 font-medium text-sm ${color}`}>{label}</td>
                    <td className="pr-4 py-3 text-muted-foreground">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
