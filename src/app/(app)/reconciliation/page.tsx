import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { ReconciliationClient } from "./reconciliation-client"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReconRecord {
  id: string
  shop_id: string
  branch_id: string
  reconciliation_date: string
  recorded_by: string
  expected_cash: number
  actual_cash: number
  cash_variance: number
  expected_mobile: number
  actual_mobile: number
  mobile_variance: number
  status: "balanced" | "flagged"
  notes: string | null
  session_type: "direct" | "bulk"
  batch_id: string | null
  credit_repayments_cash: number
  till_expenses: number
  created_at: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReconciliationPage() {
  const session = await getSessionContext()
  if (!session || !session.shop_id) redirect("/login")

  const supabase = await createClient()

  // ── 60 days ago cutoff ──────────────────────────────────────────────────────
  const sixtyDaysAgo = new Date(Date.now() - 59 * 86400000)
    .toISOString()
    .split("T")[0]

  // ── 1. Reconciliations (last 60 days) ───────────────────────────────────────
  const reconQuery = supabase
    .from("reconciliations")
    .select("*")
    .eq("shop_id", session.shop_id)
    .gte("reconciliation_date", sixtyDaysAgo)
    .order("reconciliation_date", { ascending: false })

  if (session.branch_id) reconQuery.eq("branch_id", session.branch_id)
  const { data: reconciliations } = await reconQuery

  // ── 2. Sales date + batch_id for session-count map ──────────────────────────
  const salesQuery = supabase
    .from("sales")
    .select("sale_date, batch_id")
    .eq("shop_id", session.shop_id)
    .gte("sale_date", sixtyDaysAgo)

  if (session.branch_id) salesQuery.eq("branch_id", session.branch_id)
  const { data: salesRows } = await salesQuery

  // Build date → { directCount, batchIds } map
  const dateMap: Record<
    string,
    { hasDirectSales: boolean; batchIds: Set<string> }
  > = {}

  for (const row of salesRows ?? []) {
    if (!dateMap[row.sale_date]) {
      dateMap[row.sale_date] = { hasDirectSales: false, batchIds: new Set() }
    }
    if (row.batch_id == null) {
      dateMap[row.sale_date].hasDirectSales = true
    } else {
      dateMap[row.sale_date].batchIds.add(row.batch_id)
    }
  }

  // Compute session counts per date
  const saleDateSessions = Object.entries(dateMap)
    .map(([date, { hasDirectSales, batchIds }]) => ({
      date,
      sessionCount: batchIds.size + (hasDirectSales ? 1 : 0),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  // ── 3. Shop currency + tolerance ────────────────────────────────────────────
  const { data: shop } = await supabase
    .from("shops")
    .select("currency, recon_tolerance")
    .eq("id", session.shop_id)
    .single()

  // ── 4. Branches (for shop-level users) ──────────────────────────────────────
  let branches: { id: string; name: string }[] = []
  if (!session.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select("id, name")
      .eq("shop_id", session.shop_id)
      .eq("status", "active")
    branches = data ?? []
  }

  return (
    <ReconciliationClient
      reconciliations={(reconciliations ?? []) as ReconRecord[]}
      saleDateSessions={saleDateSessions}
      currency={shop?.currency ?? "USD"}
      tolerance={shop?.recon_tolerance ?? 0}
      session={session}
      branches={branches}
    />
  )
}
