"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useBranch } from "@/hooks/useBranch"
import { formatCurrency } from "@/utils/format"
import { DateRangeFilter } from "@/components/shared/date-range-filter"
import { ExportButtons, exportCSV, exportXLSX } from "./history-client"
import type { SessionContext } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawSale {
  id: string
  sale_date: string
  payment_method: string
  branch_id: string
  sale_items: RawSaleItem[]
}

interface RawSaleItem {
  product_id: string
  quantity_kg: number
  quantity_units: number
  cost_price_at_sale: number
  line_total: number
  product: { name: string; unit_type: string } | null
}

interface ProductRow {
  product_id: string
  name: string
  unit_type: string
  qty: number
  cash: number
  mobile: number
  credit: number
  revenue: number
  cogs: number
  profit: number
}

interface MatrixCell { qty: number; revenue: number }

interface Props {
  session: SessionContext
  branches: { id: string; name: string }[]
  currency: string
  activeBranchId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function fmtQty(qty: number, unitType: string) {
  return unitType === "kg"
    ? `${qty % 1 === 0 ? qty : qty.toFixed(2)} kg`
    : `${qty} units`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 86400000
  ) + 1
}

function formatRangeLabel(start: string, end: string): string {
  const from = new Date(start + "T00:00:00")
  const to   = new Date(end   + "T00:00:00")
  if (start === end)
    return from.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
}

function formatColDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return {
    day:  d.toLocaleDateString("en-GB", { weekday: "short" }),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesHistory({ session, currency, activeBranchId }: Props) {
  const { selectedBranchId } = useBranch()
  const branchId = session.branch_id ?? selectedBranchId ?? activeBranchId

  const [start, setStart]     = useState(today)
  const [end,   setEnd]       = useState(today)
  const [viewMode, setViewMode] = useState<"summary" | "matrix">("summary")
  const [matrixSub, setMatrixSub] = useState<"qty" | "revenue" | "both">("both")
  const [sales, setSales]     = useState<RawSale[]>([])
  const [loading, setLoading] = useState(false)

  const isMultiDay = start !== end

  useEffect(() => { if (!isMultiDay) setViewMode("summary") }, [isMultiDay])

  useEffect(() => {
    let cancelled = false
    async function fetchSales() {
      setLoading(true)
      const supabase = createClient()
      let q = supabase
        .from("sales")
        .select(`
          id, sale_date, payment_method, branch_id,
          sale_items(product_id, quantity_kg, quantity_units, cost_price_at_sale, line_total,
            product:products(name, unit_type))
        `)
        .eq("shop_id", session.shop_id!)
        .gte("sale_date", start)
        .lte("sale_date", end)
        .order("sale_date", { ascending: true })
      if (branchId) q = q.eq("branch_id", branchId)
      const { data } = await q
      if (!cancelled) setSales((data ?? []) as unknown as RawSale[])
      setLoading(false)
    }
    fetchSales()
    return () => { cancelled = true }
  }, [start, end, branchId, session.shop_id])

  // ── Derived: summary ─────────────────────────────────────────────────────

  const { productRows, totals } = useMemo(() => {
    const map = new Map<string, ProductRow>()
    let totalRevenue = 0, totalCash = 0, totalMobile = 0, totalCredit = 0
    let totalCogs = 0, txCount = 0
    const seenSales = new Set<string>()

    for (const sale of sales) {
      if (!seenSales.has(sale.id)) { seenSales.add(sale.id); txCount++ }
      for (const item of sale.sale_items) {
        const ut   = item.product?.unit_type ?? "units"
        const qty  = ut === "kg" ? item.quantity_kg : item.quantity_units
        const cogs = item.cost_price_at_sale * qty
        const lt   = item.line_total
        const row  = map.get(item.product_id) ?? {
          product_id: item.product_id,
          name: item.product?.name ?? "Unknown",
          unit_type: ut,
          qty: 0, cash: 0, mobile: 0, credit: 0, revenue: 0, cogs: 0, profit: 0,
        }
        row.qty     += qty
        row.revenue += lt
        row.cogs    += cogs
        row.profit   = row.revenue - row.cogs
        const pm = sale.payment_method
        if (pm === "cash")              { row.cash   += lt; totalCash   += lt }
        else if (pm === "mobile_money") { row.mobile += lt; totalMobile += lt }
        else if (pm === "credit")       { row.credit += lt; totalCredit += lt }
        map.set(item.product_id, row)
        totalRevenue += lt
        totalCogs    += cogs
      }
    }
    return {
      productRows: [...map.values()].sort((a, b) => b.revenue - a.revenue),
      totals: {
        revenue: totalRevenue, cash: totalCash, mobile: totalMobile,
        credit: totalCredit, cogs: totalCogs,
        profit: totalRevenue - totalCogs,
        margin: totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0,
        txCount,
      },
    }
  }, [sales])

  // ── Derived: matrix ──────────────────────────────────────────────────────

  const { matrixProducts, dateCols } = useMemo(() => {
    const numDays = daysBetween(start, end)
    const dateCols: string[] = []
    for (let i = 0; i < numDays; i++) dateCols.push(addDays(start, i))
    const map = new Map<string, { name: string; unit_type: string; cells: Map<string, MatrixCell> }>()
    for (const sale of sales) {
      for (const item of sale.sale_items) {
        const ut  = item.product?.unit_type ?? "units"
        const qty = ut === "kg" ? item.quantity_kg : item.quantity_units
        if (!map.has(item.product_id))
          map.set(item.product_id, { name: item.product?.name ?? "Unknown", unit_type: ut, cells: new Map() })
        const prod = map.get(item.product_id)!
        const cell = prod.cells.get(sale.sale_date) ?? { qty: 0, revenue: 0 }
        cell.qty     += qty
        cell.revenue += item.line_total
        prod.cells.set(sale.sale_date, cell)
      }
    }
    return {
      matrixProducts: [...map.entries()]
        .map(([pid, v]) => ({ product_id: pid, ...v }))
        .sort((a, b) =>
          [...b.cells.values()].reduce((s, c) => s + c.revenue, 0) -
          [...a.cells.values()].reduce((s, c) => s + c.revenue, 0)
        ),
      dateCols,
    }
  }, [sales, start, end])

  // ── Exports ──────────────────────────────────────────────────────────────

  function handleCSV() {
    exportCSV(
      productRows.map((r) => ({
        Product: r.name,
        "Qty Sold": `${r.qty.toFixed(r.unit_type === "kg" ? 3 : 0)} ${r.unit_type}`,
        Cash: r.cash.toFixed(2), Mobile: r.mobile.toFixed(2), Credit: r.credit.toFixed(2),
        Revenue: r.revenue.toFixed(2), COGS: r.cogs.toFixed(2), "Gross Profit": r.profit.toFixed(2),
      })),
      `sales-history-${start}-to-${end}.csv`
    )
  }
  function handleXLSX() {
    exportXLSX(
      productRows.map((r) => ({
        Product: r.name,
        "Qty Sold": `${r.qty.toFixed(r.unit_type === "kg" ? 3 : 0)} ${r.unit_type}`,
        Cash: r.cash, Mobile: r.mobile, Credit: r.credit,
        Revenue: r.revenue, COGS: r.cogs, "Gross Profit": r.profit,
      })) as Record<string, unknown>[],
      `sales-history-${start}-to-${end}.xlsx`
    )
  }

  const fc = (n: number) => formatCurrency(n, currency)

  return (
    <>
      {/* Filter bar — sticky just below the top tabs */}
      <div className="sticky top-7 md:top-5 z-10 bg-background border-b border-border">
        <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-3">
          <DateRangeFilter start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e) }} defaultRange={[today(), today()]} />
          <div className="ml-auto flex items-center gap-2">
            {isMultiDay && (
              <div className="flex rounded border border-border overflow-hidden">
                {(["summary", "matrix"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      viewMode === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-primary"
                    }`}
                  >
                    {m === "summary" ? "⊞ Summary" : "⊟ Matrix"}
                  </button>
                ))}
              </div>
            )}
            <ExportButtons onCSV={handleCSV} onXLSX={handleXLSX} />
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="px-4 md:px-6 pt-4 pb-6 space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-4">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Revenue</p>
            <p className="text-2xl font-bold mt-1">{fc(totals.revenue)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{totals.txCount} transactions</p>
          </div>
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">Cash Collected</p>
            <p className="text-2xl font-bold mt-1">{fc(totals.cash)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Mobile: {fc(totals.mobile)}</p>
          </div>
          <div className="rounded-lg border bg-orange-50 dark:bg-orange-950/20 p-4">
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Credit Sales</p>
            <p className="text-2xl font-bold mt-1">{fc(totals.credit)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Not yet collected</p>
          </div>
          <div className="rounded-lg border bg-purple-50 dark:bg-purple-950/20 p-4">
            <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Gross Profit</p>
            <p className="text-2xl font-bold mt-1">{fc(totals.profit)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{totals.margin.toFixed(1)}% margin</p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : productRows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">No sales in this period</div>
        ) : viewMode === "summary" ? (
          <SummaryTable rows={productRows} start={start} end={end} currency={currency} />
        ) : (
          <MatrixTable
            products={matrixProducts}
            dateCols={dateCols}
            start={start}
            end={end}
            sub={matrixSub}
            onSubChange={setMatrixSub}
            currency={currency}
          />
        )}
      </div>
    </>
  )
}

// ─── Summary table ────────────────────────────────────────────────────────────

function SummaryTable({ rows, start, end, currency }: { rows: ProductRow[]; start: string; end: string; currency: string }) {
  const fc = (n: number) => formatCurrency(n, currency)
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <span className="text-sm font-medium">{formatRangeLabel(start, end)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/20">
              {["Product","Qty Sold","Cash","Mobile","Credit","Revenue","COGS","Gross Profit"].map((h) => (
                <th key={h} className={`px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap ${h === "Product" ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.product_id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtQty(r.qty, r.unit_type)}</td>
                <td className="px-4 py-2.5 text-right text-green-600">{r.cash   > 0 ? fc(r.cash)   : <Dash />}</td>
                <td className="px-4 py-2.5 text-right text-purple-600">{r.mobile > 0 ? fc(r.mobile) : <Dash />}</td>
                <td className="px-4 py-2.5 text-right text-orange-600">{r.credit > 0 ? fc(r.credit) : <Dash />}</td>
                <td className="px-4 py-2.5 text-right font-medium">{fc(r.revenue)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{fc(r.cogs)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.profit < 0 ? "text-red-600" : "text-green-600"}`}>
                  {r.profit < 0 ? `-${fc(Math.abs(r.profit))}` : fc(r.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Matrix table ─────────────────────────────────────────────────────────────

function MatrixTable({
  products, dateCols, start, end, sub, onSubChange, currency,
}: {
  products: { product_id: string; name: string; unit_type: string; cells: Map<string, MatrixCell> }[]
  dateCols: string[]
  start: string
  end: string
  sub: "qty" | "revenue" | "both"
  onSubChange: (s: "qty" | "revenue" | "both") => void
  currency: string
}) {
  const fc = (n: number) => formatCurrency(n, currency)

  const colTotals = dateCols.map((d) => {
    let qty = 0, revenue = 0
    for (const p of products) { const c = p.cells.get(d); if (c) { qty += c.qty; revenue += c.revenue } }
    return { qty, revenue }
  })
  const grandQty = products.reduce((s, p) => s + [...p.cells.values()].reduce((a, c) => a + c.qty, 0), 0)
  const grandRev = products.reduce((s, p) => s + [...p.cells.values()].reduce((a, c) => a + c.revenue, 0), 0)

  const CELL = "border-r border-border last:border-r-0"

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b bg-muted/30">
        <div>
          <p className="text-sm font-medium">{formatRangeLabel(start, end)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dateCols.length} days · {products.length} products
          </p>
        </div>
        <div className="flex rounded border border-border overflow-hidden text-xs">
          {(["qty","revenue","both"] as const).map((m) => (
            <button key={m} onClick={() => onSubChange(m)}
              className={`px-2.5 py-1.5 font-medium transition-colors ${
                sub === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-primary"
              }`}
            >
              {m === "both" ? "Qty + Rev" : m === "qty" ? "Qty" : "Revenue"}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable grid */}
      <div className="overflow-x-auto">
        <table
          className="text-sm border-collapse"
          style={{ minWidth: `${180 + dateCols.length * 110 + 120}px` }}
        >
          <thead>
            <tr className="border-b bg-muted/20">
              <th className={`sticky left-0 z-10 bg-muted/20 text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-44 min-w-[11rem] ${CELL}`}>
                Product
              </th>
              {dateCols.map((d) => {
                const { day, date } = formatColDate(d)
                return (
                  <th key={d} className={`px-3 py-2 text-center text-xs font-medium text-muted-foreground min-w-[100px] ${CELL}`}>
                    <div>{day}</div>
                    <div className="text-[11px] text-muted-foreground/60">{date}</div>
                  </th>
                )
              })}
              <th className="sticky right-0 z-10 bg-muted/20 text-right px-4 py-2.5 text-xs font-medium text-muted-foreground min-w-[110px] border-l border-border">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((p) => {
              const rowQty = [...p.cells.values()].reduce((s, c) => s + c.qty, 0)
              const rowRev = [...p.cells.values()].reduce((s, c) => s + c.revenue, 0)
              return (
                <tr key={p.product_id} className="hover:bg-muted/10">
                  <td className={`sticky left-0 z-10 bg-background px-4 py-2.5 font-medium ${CELL}`}>
                    {p.name}{" "}
                    <span className="text-xs text-muted-foreground font-normal">({p.unit_type})</span>
                  </td>
                  {dateCols.map((d) => {
                    const c = p.cells.get(d)
                    return (
                      <td key={d} className={`px-3 py-2.5 text-center ${CELL}`}>
                        {!c ? (
                          <span className="text-muted-foreground/30">—</span>
                        ) : (
                          <>
                            {(sub === "qty" || sub === "both") && (
                              <div className="font-medium text-xs">
                                {p.unit_type === "kg" ? c.qty.toFixed(2) : c.qty} {p.unit_type}
                              </div>
                            )}
                            {(sub === "revenue" || sub === "both") && (
                              <div className="text-[11px] text-muted-foreground">{fc(c.revenue)}</div>
                            )}
                          </>
                        )}
                      </td>
                    )
                  })}
                  <td className="sticky right-0 z-10 bg-background px-4 py-2.5 text-right border-l border-border">
                    {(sub === "qty" || sub === "both") && (
                      <div className="font-medium text-xs">
                        {p.unit_type === "kg" ? rowQty.toFixed(2) : rowQty} {p.unit_type}
                      </div>
                    )}
                    {(sub === "revenue" || sub === "both") && (
                      <div className="text-[11px] text-muted-foreground">{fc(rowRev)}</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/20 font-medium">
              <td className={`sticky left-0 z-10 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground ${CELL}`}>
                Total
              </td>
              {colTotals.map((ct, i) => (
                <td key={i} className={`px-3 py-2.5 text-center ${CELL}`}>
                  {(sub === "qty" || sub === "both") && <div className="text-xs">{ct.qty.toFixed(2)}</div>}
                  {(sub === "revenue" || sub === "both") && <div className="text-[11px] text-muted-foreground">{fc(ct.revenue)}</div>}
                </td>
              ))}
              <td className="sticky right-0 z-10 bg-muted/20 px-4 py-2.5 text-right border-l border-border">
                {(sub === "qty" || sub === "both") && <div className="text-xs">{grandQty.toFixed(2)}</div>}
                {(sub === "revenue" || sub === "both") && <div className="text-[11px] text-muted-foreground">{fc(grandRev)}</div>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Dash() { return <span className="text-muted-foreground/30">—</span> }
