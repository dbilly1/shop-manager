"use client"

import { useState, useMemo } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  CreditCard,
  BarChart2,
  ShoppingCart,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { formatCurrency } from "@/utils/format"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DateRangeFilter } from "@/components/shared/date-range-filter"

interface Props {
  sales: { sale_date: string; total_amount: number; payment_method: string }[]
  expenses: { expense_date: string; amount: number; category: string }[]
  saleItems: {
    sale_date?: string
    product_id: string
    quantity_kg: number
    quantity_units: number
    quantity_boxes: number
    unit_price: number
    line_total: number
    cost_price_at_sale: number
    product: { name: string } | null
  }[]
  creditData: { balance: number; amount_paid: number }[]
  priorSales: { sale_date: string; total_amount: number; payment_method: string }[]
  priorExpenses: { expense_date: string; amount: number }[]
  reconciliations: { status: string; cash_variance: number; mobile_variance: number }[]
  currency: string
  startDate: string
  endDate: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAxisDate(label: unknown): string {
  return new Date(String(label ?? "") + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function eachDayInRange(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + "T00:00:00")
  const last = new Date(end + "T00:00:00")
  while (cur <= last) {
    days.push(cur.toISOString().split("T")[0])
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function trendPct(cur: number, prior: number): number | null {
  if (prior === 0) return null
  return ((cur - prior) / Math.abs(prior)) * 100
}

// ─── StatCard ───────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  valueClass?: string
  sub?: string
  trend?: number | null
  trendInverse?: boolean
}

function StatCard({ icon, iconBg, label, value, valueClass, sub, trend, trendInverse }: StatCardProps) {
  const hasTrend = trend !== null && trend !== undefined
  const isPositive = hasTrend && (trend ?? 0) >= 0
  // For inverse metrics (expenses), positive change = bad (red), negative = good (green)
  const trendGood = trendInverse ? !isPositive : isPositive
  const trendColor = trendGood ? "text-green-600" : "text-red-600"

  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>{icon}</div>
        <span className="text-xs text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold leading-tight ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {hasTrend && (
        <div className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
          {isPositive
            ? <ArrowUpRight className="h-3 w-3 flex-shrink-0" />
            : <ArrowDownRight className="h-3 w-3 flex-shrink-0" />}
          <span>
            {isPositive ? "+" : ""}{(trend ?? 0).toFixed(0)}% vs prior
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Products table helpers ──────────────────────────────────────────────────

type SortKey = "productName" | "revenue" | "cogs" | "grossProfit" | "margin" | "qtySold"
type SortDir = "asc" | "desc"

function marginClass(m: number): string {
  if (m >= 30) return "text-green-600 font-medium"
  if (m >= 15) return "text-amber-600 font-medium"
  return "text-red-600 font-medium"
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="inline ml-1 h-3 w-3 opacity-40" />
  return sortDir === "asc"
    ? <ChevronUp className="inline ml-1 h-3 w-3" />
    : <ChevronDown className="inline ml-1 h-3 w-3" />
}

// ─── Main component ──────────────────────────────────────────────────────────

type DowFilterKey = "all" | "cash" | "mobile" | "no_credit"

export function ReportsClient({
  sales,
  expenses,
  saleItems,
  creditData,
  priorSales,
  priorExpenses,
  reconciliations,
  currency,
  startDate,
  endDate,
}: Props) {
  const [rangeStart, setRangeStart] = useState(startDate)
  const [rangeEnd, setRangeEnd] = useState(endDate)
  const [sortKey, setSortKey] = useState<SortKey>("grossProfit")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dowFilter, setDowFilter] = useState<DowFilterKey>("all")

  function handleRangeChange(start: string, end: string) {
    setRangeStart(start)
    setRangeEnd(end)
  }

  function toggleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(col)
      setSortDir(col === "productName" ? "asc" : "desc")
    }
  }

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredSales = useMemo(
    () => sales.filter((s) => s.sale_date >= rangeStart && s.sale_date <= rangeEnd),
    [sales, rangeStart, rangeEnd]
  )
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date >= rangeStart && e.expense_date <= rangeEnd),
    [expenses, rangeStart, rangeEnd]
  )
  const filteredSaleItems = useMemo(
    () =>
      saleItems.filter((item) => {
        if (!item.sale_date) return true
        return item.sale_date >= rangeStart && item.sale_date <= rangeEnd
      }),
    [saleItems, rangeStart, rangeEnd]
  )

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalRevenue = useMemo(() => filteredSales.reduce((s, x) => s + x.total_amount, 0), [filteredSales])
  const cashRevenue = useMemo(
    () => filteredSales.filter((s) => s.payment_method === "cash").reduce((s, x) => s + x.total_amount, 0),
    [filteredSales]
  )
  const mobileRevenue = useMemo(
    () => filteredSales.filter((s) => s.payment_method === "mobile").reduce((s, x) => s + x.total_amount, 0),
    [filteredSales]
  )
  const creditRevenue = useMemo(
    () => filteredSales.filter((s) => s.payment_method === "credit").reduce((s, x) => s + x.total_amount, 0),
    [filteredSales]
  )
  const totalExpenses = useMemo(() => filteredExpenses.reduce((s, x) => s + x.amount, 0), [filteredExpenses])

  // COGS from sale items
  const totalCOGS = useMemo(
    () =>
      filteredSaleItems.reduce((sum, item) => {
        const qty = item.quantity_kg + item.quantity_units + item.quantity_boxes
        return sum + item.cost_price_at_sale * qty
      }, 0),
    [filteredSaleItems]
  )

  const grossProfit = totalRevenue - totalCOGS
  const netProfit = grossProfit - totalExpenses
  const cogsRatio = totalRevenue > 0 ? totalCOGS / totalRevenue : 0
  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // ── Prior period KPIs ──────────────────────────────────────────────────────
  const priorRevenue = useMemo(() => priorSales.reduce((s, x) => s + x.total_amount, 0), [priorSales])
  const priorExpensesTotal = useMemo(() => priorExpenses.reduce((s, x) => s + x.amount, 0), [priorExpenses])
  const priorGrossProfit = priorRevenue * (1 - cogsRatio)
  const priorNetProfit = priorGrossProfit - priorExpensesTotal

  const revenueTrend = trendPct(totalRevenue, priorRevenue)
  const grossProfitTrend = trendPct(grossProfit, priorGrossProfit)
  const expensesTrend = trendPct(totalExpenses, priorExpensesTotal)
  const netProfitTrend = trendPct(netProfit, priorNetProfit)

  // ── Credit ─────────────────────────────────────────────────────────────────
  const totalRepaid = useMemo(() => creditData.reduce((s, c) => s + c.amount_paid, 0), [creditData])
  const totalOutstanding = useMemo(() => creditData.reduce((s, c) => s + c.balance, 0), [creditData])

  // ── Reconciliation ─────────────────────────────────────────────────────────
  const balancedCount = useMemo(
    () => reconciliations.filter((r) => r.status === "balanced").length,
    [reconciliations]
  )
  const flaggedCount = useMemo(
    () => reconciliations.filter((r) => r.status === "flagged").length,
    [reconciliations]
  )
  const totalCashVariance = useMemo(
    () => reconciliations.reduce((s, r) => s + r.cash_variance, 0),
    [reconciliations]
  )
  const totalMobileVariance = useMemo(
    () => reconciliations.reduce((s, r) => s + r.mobile_variance, 0),
    [reconciliations]
  )
  const totalNetVariance = totalCashVariance + totalMobileVariance

  // ── Daily chart data ────────────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const days = eachDayInRange(rangeStart, rangeEnd)
    const salesByDay = new Map<string, number>()
    for (const day of days) salesByDay.set(day, 0)
    for (const s of filteredSales) {
      salesByDay.set(s.sale_date, (salesByDay.get(s.sale_date) ?? 0) + s.total_amount)
    }
    const expByDay = new Map<string, number>()
    for (const e of filteredExpenses) {
      expByDay.set(e.expense_date, (expByDay.get(e.expense_date) ?? 0) + e.amount)
    }
    return days.map((day) => {
      const dailyRevenue = salesByDay.get(day) ?? 0
      const dailyExp = expByDay.get(day) ?? 0
      const dailyCOGS = dailyRevenue * cogsRatio
      const dailyGrossProfit = dailyRevenue - dailyCOGS
      const dailyNetProfit = dailyGrossProfit - dailyExp
      return {
        date: day,
        revenue: dailyRevenue,
        grossProfit: dailyGrossProfit,
        netProfit: dailyNetProfit,
      }
    })
  }, [filteredSales, filteredExpenses, rangeStart, rangeEnd, cogsRatio])

  // ── DOW chart ───────────────────────────────────────────────────────────────
  const dowFilteredSales = useMemo(() => {
    switch (dowFilter) {
      case "cash":
        return filteredSales.filter((s) => s.payment_method === "cash")
      case "mobile":
        return filteredSales.filter((s) => s.payment_method === "mobile")
      case "no_credit":
        return filteredSales.filter((s) => s.payment_method !== "credit")
      default:
        return filteredSales
    }
  }, [filteredSales, dowFilter])

  const dowData = useMemo(() => {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const map = new Map<number, { total: number; count: number }>()
    for (let i = 0; i < 7; i++) map.set(i, { total: 0, count: 0 })
    const byDate = new Map<string, number>()
    for (const s of dowFilteredSales) {
      byDate.set(s.sale_date, (byDate.get(s.sale_date) ?? 0) + s.total_amount)
    }
    for (const [date, total] of byDate) {
      const dow = new Date(date + "T00:00:00").getDay()
      const e = map.get(dow)!
      e.total += total
      e.count += 1
    }
    // Sun first: 0,1,2,3,4,5,6
    return [0, 1, 2, 3, 4, 5, 6].map((dow) => {
      const e = map.get(dow)!
      return { day: labels[dow], avg: e.count > 0 ? e.total / e.count : 0 }
    })
  }, [dowFilteredSales])

  // ── Expense by category ─────────────────────────────────────────────────────
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filteredExpenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredExpenses])

  // ── Product profitability ───────────────────────────────────────────────────
  const productRows = useMemo(() => {
    const map = new Map<string, { productName: string; revenue: number; cogs: number; qtySold: number }>()
    for (const item of saleItems) {
      const qty = item.quantity_kg + item.quantity_units + item.quantity_boxes
      const cogs = item.cost_price_at_sale * qty
      const ex = map.get(item.product_id)
      if (ex) {
        ex.revenue += item.line_total
        ex.cogs += cogs
        ex.qtySold += qty
      } else {
        map.set(item.product_id, {
          productName: item.product?.name ?? item.product_id,
          revenue: item.line_total,
          cogs,
          qtySold: qty,
        })
      }
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      grossProfit: r.revenue - r.cogs,
      margin: r.revenue > 0 ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0,
    }))
  }, [saleItems])

  const sortedRows = useMemo(() => {
    return [...productRows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [productRows, sortKey, sortDir])

  const productTotals = useMemo(() => {
    const revenue = productRows.reduce((s, r) => s + r.revenue, 0)
    const cogs = productRows.reduce((s, r) => s + r.cogs, 0)
    const gp = revenue - cogs
    return {
      revenue,
      cogs,
      grossProfit: gp,
      margin: revenue > 0 ? (gp / revenue) * 100 : 0,
      qtySold: productRows.reduce((s, r) => s + r.qtySold, 0),
    }
  }, [productRows])

  const thClass =
    "px-4 py-3 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap"

  // ── DOW filter buttons ──────────────────────────────────────────────────────
  const dowFilterOptions: { label: string; key: DowFilterKey }[] = [
    { label: "All", key: "all" },
    { label: "Cash", key: "cash" },
    { label: "Mobile", key: "mobile" },
    { label: "No Credit", key: "no_credit" },
  ]

  return (
    <div className="-m-4 md:-m-6">
      <Tabs defaultValue="overview" className="gap-0">

        {/* Sticky tab nav + filters */}
        <div className="sticky -top-4 md:-top-6 z-20 bg-background">
          <TabsList className="px-4 md:px-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-3 border-b border-border">
            <DateRangeFilter start={rangeStart} end={rangeEnd} onChange={handleRangeChange} />
          </div>
        </div>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-4 px-4 md:px-6 pt-4 pb-6">

          {/* ── KPI grid: 5-column with sidebar ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

            {/* Row 1, cols 1-4: Revenue breakdown */}
            <StatCard
              icon={<DollarSign className="h-3.5 w-3.5 text-blue-600" />}
              iconBg="bg-blue-500/15"
              label="Total Revenue"
              value={formatCurrency(totalRevenue, currency)}
              valueClass="text-blue-600"
              trend={revenueTrend}
            />
            <StatCard
              icon={<Wallet className="h-3.5 w-3.5 text-green-600" />}
              iconBg="bg-green-500/15"
              label="Cash Sales"
              value={formatCurrency(cashRevenue, currency)}
              valueClass="text-green-600"
              sub={totalRevenue > 0 ? `${((cashRevenue / totalRevenue) * 100).toFixed(0)}% of revenue` : "—"}
            />
            <StatCard
              icon={<CreditCard className="h-3.5 w-3.5 text-blue-600" />}
              iconBg="bg-blue-500/15"
              label="Mobile Money"
              value={formatCurrency(mobileRevenue, currency)}
              valueClass="text-blue-600"
              sub={totalRevenue > 0 ? `${((mobileRevenue / totalRevenue) * 100).toFixed(0)}% of revenue` : "—"}
            />
            <StatCard
              icon={<ShoppingCart className="h-3.5 w-3.5 text-purple-600" />}
              iconBg="bg-purple-500/15"
              label="Credit Sales"
              value={formatCurrency(creditRevenue, currency)}
              valueClass="text-purple-600"
              sub={totalRevenue > 0 ? `${((creditRevenue / totalRevenue) * 100).toFixed(0)}% of revenue` : "—"}
            />

            {/* Row 1, col 5 (sidebar): Repayments — spans 2 rows on lg */}
            <div className="lg:row-span-2">
              <div className="bg-card border rounded-lg p-4 h-full flex flex-col gap-4">
                <p className="font-semibold text-sm">Credit Position</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/15">
                      <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">Repayments Received</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600 leading-tight">
                    {formatCurrency(totalRepaid, currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">collected this period</div>
                </div>
                <div className="border-t pt-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-500/15">
                      <Receipt className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">Outstanding Balance</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-600 leading-tight">
                    {formatCurrency(totalOutstanding, currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">unpaid across all customers</div>
                </div>
              </div>
            </div>

            {/* Row 2, cols 1-3: Profit breakdown */}
            <StatCard
              icon={<TrendingUp className="h-3.5 w-3.5 text-green-600" />}
              iconBg="bg-green-500/15"
              label="Gross Profit"
              value={formatCurrency(grossProfit, currency)}
              valueClass={grossProfit >= 0 ? "text-green-600" : "text-red-600"}
              sub={`${grossMarginPct.toFixed(1)}% margin`}
              trend={grossProfitTrend}
            />
            <StatCard
              icon={<Receipt className="h-3.5 w-3.5 text-amber-600" />}
              iconBg="bg-amber-500/15"
              label="Expenses"
              value={formatCurrency(totalExpenses, currency)}
              valueClass="text-amber-600"
              sub="operating costs"
              trend={expensesTrend}
              trendInverse
            />
            <StatCard
              icon={<BarChart2 className="h-3.5 w-3.5 text-green-600" />}
              iconBg="bg-green-500/15"
              label="Net Profit"
              value={formatCurrency(netProfit, currency)}
              valueClass={netProfit >= 0 ? "text-green-600" : "text-red-600"}
              trend={netProfitTrend}
            />

            {/* Row 2, col 4: empty spacer on desktop */}
            <div className="hidden lg:block" />

            {/* Row 2, col 5 is covered by the row-span-2 sidebar above */}
          </div>

          {/* ── Chart row 1: Daily Revenue vs Profit + Expense Breakdown ── */}
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Daily line chart — 2/3 width */}
            <div className="bg-card border rounded-lg p-4 lg:col-span-2">
              <p className="font-semibold text-sm mb-4">Daily Revenue vs Profit</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v, currency)}
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(v: unknown) => formatCurrency(Number(v), currency)}
                    labelFormatter={formatAxisDate}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#3b82f6"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="grossProfit"
                    name="Gross Profit"
                    stroke="#22c55e"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="netProfit"
                    name="Net Profit"
                    stroke="#8b5cf6"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Expense breakdown — horizontal bar chart, 1/3 width */}
            <div className="bg-card border rounded-lg p-4">
              <p className="font-semibold text-sm mb-4">Expense Breakdown</p>
              {expenseByCategory.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                  No expense data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    layout="vertical"
                    data={expenseByCategory}
                    margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => formatCurrency(v, currency)}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <Tooltip formatter={(v: unknown) => formatCurrency(Number(v), currency)} />
                    <Bar dataKey="value" name="Expenses" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── Chart row 2: Avg Revenue by DOW + Reconciliation Summary ── */}
          <div className="grid lg:grid-cols-3 gap-4">
            {/* DOW bar chart — 2/3 width */}
            <div className="bg-card border rounded-lg p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <p className="font-semibold text-sm">Average Revenue by Day of Week</p>
                <div className="flex items-center gap-1">
                  {dowFilterOptions.map(({ label, key }) => {
                    const selected = dowFilter === key
                    return (
                      <button
                        key={key}
                        onClick={() => setDowFilter(key)}
                        className={[
                          "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
                          selected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary hover:text-primary",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dowData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v, currency)}
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip formatter={(v: unknown) => formatCurrency(Number(v), currency)} />
                  <Bar dataKey="avg" name="Avg Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Reconciliation Summary — 1/3 width */}
            <div className="bg-card border rounded-lg p-4 h-full flex flex-col gap-4">
              <p className="font-semibold text-sm">Reconciliation Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{balancedCount}</p>
                  <p className="text-xs text-green-700 mt-0.5">Balanced</p>
                </div>
                <div className="rounded-lg bg-red-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{flaggedCount}</p>
                  <p className="text-xs text-red-700 mt-0.5">Flagged</p>
                </div>
              </div>
              <div className="space-y-2 text-sm flex-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash variance</span>
                  <span
                    className={
                      totalCashVariance < 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"
                    }
                  >
                    {totalCashVariance >= 0 ? "+" : ""}
                    {formatCurrency(totalCashVariance, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mobile variance</span>
                  <span
                    className={
                      totalMobileVariance < 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"
                    }
                  >
                    {totalMobileVariance >= 0 ? "+" : ""}
                    {formatCurrency(totalMobileVariance, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net variance</span>
                  <span
                    className={
                      totalNetVariance < 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"
                    }
                  >
                    {totalNetVariance >= 0 ? "+" : ""}
                    {formatCurrency(totalNetVariance, currency)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Positive = surplus · Negative = shortfall</p>
            </div>
          </div>
        </TabsContent>

        {/* ── Products ── */}
        <TabsContent value="products" className="px-4 md:px-6 pt-4 pb-6">
          {productRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No product data available</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left">
                    <th className={thClass} onClick={() => toggleSort("productName")}>
                      Product <SortIcon col="productName" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("revenue")}>
                      Revenue <SortIcon col="revenue" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("cogs")}>
                      COGS <SortIcon col="cogs" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("grossProfit")}>
                      Gross Profit <SortIcon col="grossProfit" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("margin")}>
                      Margin % <SortIcon col="margin" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("qtySold")}>
                      Qty Sold <SortIcon col="qtySold" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{row.productName}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.revenue, currency)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.cogs, currency)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.grossProfit, currency)}</td>
                      <td className={`px-4 py-3 text-right ${marginClass(row.margin)}`}>
                        {row.margin.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right">{row.qtySold.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold bg-muted/10">
                    <td className="px-4 py-3">Totals</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(productTotals.revenue, currency)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(productTotals.cogs, currency)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(productTotals.grossProfit, currency)}</td>
                    <td className={`px-4 py-3 text-right ${marginClass(productTotals.margin)}`}>
                      {productTotals.margin.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">{productTotals.qtySold.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
