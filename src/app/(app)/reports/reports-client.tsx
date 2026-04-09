"use client"

import { useState, useMemo } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
} from "lucide-react"
import { formatCurrency } from "@/utils/format"

interface SessionContext {
  user_id: string
  shop_id: string | null
  branch_id: string | null
  role: string | null
  is_super_admin: boolean
}

interface Props {
  sales: { sale_date: string; total_amount: number; payment_method: string }[]
  expenses: { expense_date: string; amount: number; category: string }[]
  saleItems: {
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
  currency: string
  startDate: string
  endDate: string
  session: SessionContext
  branches: { id: string; name: string }[]
}

const PIE_COLORS = [
  "#f59e0b",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#f97316",
  "#14b8a6",
  "#22c55e",
  "#64748b",
]

function formatAxisDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
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

interface KpiCardProps {
  label: string
  value: string
  icon: React.ReactNode
  iconBg: string
}

function KpiCard({ label, value, icon, iconBg }: KpiCardProps) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-3 ${iconBg}`}>
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

export function ReportsClient({
  sales,
  expenses,
  saleItems,
  creditData,
  currency,
  startDate,
  endDate,
  session: _session,
  branches: _branches,
}: Props) {
  const [localStart, setLocalStart] = useState(startDate)
  const [localEnd, setLocalEnd] = useState(endDate)
  const [appliedStart, setAppliedStart] = useState(startDate)
  const [appliedEnd, setAppliedEnd] = useState(endDate)

  function handleApply() {
    setAppliedStart(localStart)
    setAppliedEnd(localEnd)
  }

  // Filtered sales and expenses based on applied date range
  const filteredSales = useMemo(
    () =>
      sales.filter(
        (s) => s.sale_date >= appliedStart && s.sale_date <= appliedEnd
      ),
    [sales, appliedStart, appliedEnd]
  )

  const filteredExpenses = useMemo(
    () =>
      expenses.filter(
        (e) => e.expense_date >= appliedStart && e.expense_date <= appliedEnd
      ),
    [expenses, appliedStart, appliedEnd]
  )

  // KPI values
  const totalRevenue = useMemo(
    () => filteredSales.reduce((sum, s) => sum + s.total_amount, 0),
    [filteredSales]
  )

  const cashRevenue = useMemo(
    () =>
      filteredSales
        .filter((s) => s.payment_method === "cash")
        .reduce((sum, s) => sum + s.total_amount, 0),
    [filteredSales]
  )

  const mobileRevenue = useMemo(
    () =>
      filteredSales
        .filter((s) => s.payment_method === "mobile")
        .reduce((sum, s) => sum + s.total_amount, 0),
    [filteredSales]
  )

  const creditRevenue = useMemo(
    () =>
      filteredSales
        .filter((s) => s.payment_method === "credit")
        .reduce((sum, s) => sum + s.total_amount, 0),
    [filteredSales]
  )

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  )

  const grossProfit = totalRevenue - totalExpenses
  const profitMargin =
    totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // Credit position (not date-filtered — reflects overall credit state)
  const totalRepaid = useMemo(
    () => creditData.reduce((sum, c) => sum + c.amount_paid, 0),
    [creditData]
  )
  const totalOutstanding = useMemo(
    () => creditData.reduce((sum, c) => sum + c.balance, 0),
    [creditData]
  )

  // Daily data for charts
  const dailyData = useMemo(() => {
    const days = eachDayInRange(appliedStart, appliedEnd)

    const salesByDay = new Map<
      string,
      { cash: number; mobile: number; credit: number; total: number }
    >()
    for (const day of days) {
      salesByDay.set(day, { cash: 0, mobile: 0, credit: 0, total: 0 })
    }
    for (const s of filteredSales) {
      const entry = salesByDay.get(s.sale_date)
      if (entry) {
        entry.total += s.total_amount
        if (s.payment_method === "cash") entry.cash += s.total_amount
        else if (s.payment_method === "mobile") entry.mobile += s.total_amount
        else if (s.payment_method === "credit") entry.credit += s.total_amount
      }
    }

    const expensesByDay = new Map<string, number>()
    for (const e of filteredExpenses) {
      expensesByDay.set(
        e.expense_date,
        (expensesByDay.get(e.expense_date) ?? 0) + e.amount
      )
    }

    return days.map((day) => {
      const rev = salesByDay.get(day)!
      const exp = expensesByDay.get(day) ?? 0
      return {
        date: day,
        revenue: rev.total,
        profit: rev.total - exp,
        cash: rev.cash,
        mobile: rev.mobile,
        credit: rev.credit,
      }
    })
  }, [filteredSales, filteredExpenses, appliedStart, appliedEnd])

  // Expense breakdown by category
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filteredExpenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [filteredExpenses])

  // Reconciliation metrics
  const reconciliation = useMemo(() => {
    const count = filteredSales.length
    const avgTransaction = count > 0 ? totalRevenue / count : 0
    const distinctDays = new Set(filteredSales.map((s) => s.sale_date)).size
    const dailyRevenues = dailyData.map((d) => d.revenue)
    const largestDay =
      dailyRevenues.length > 0 ? Math.max(...dailyRevenues) : 0

    const methods: { label: string; value: number }[] = [
      { label: "Cash", value: cashRevenue },
      { label: "Mobile", value: mobileRevenue },
      { label: "Credit", value: creditRevenue },
    ]
    const best = methods.reduce(
      (a, b) => (b.value > a.value ? b : a),
      methods[0]
    )
    const bestMethod = best && best.value > 0 ? best.label : "N/A"

    return { count, avgTransaction, distinctDays, largestDay, bestMethod }
  }, [filteredSales, totalRevenue, dailyData, cashRevenue, mobileRevenue, creditRevenue])

  // Product profitability table (uses all saleItems — not date-filtered server-side)
  const productRows = useMemo(() => {
    const map = new Map<
      string,
      {
        productName: string
        revenue: number
        cogs: number
        qtySold: number
      }
    >()

    for (const item of saleItems) {
      const existing = map.get(item.product_id)
      const qty = item.quantity_kg + item.quantity_units + item.quantity_boxes
      const cogs = item.cost_price_at_sale * qty

      if (existing) {
        existing.revenue += item.line_total
        existing.cogs += cogs
        existing.qtySold += qty
      } else {
        map.set(item.product_id, {
          productName: item.product?.name ?? item.product_id,
          revenue: item.line_total,
          cogs,
          qtySold: qty,
        })
      }
    }

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        grossProfit: row.revenue - row.cogs,
        margin:
          row.revenue > 0
            ? ((row.revenue - row.cogs) / row.revenue) * 100
            : 0,
      }))
      .sort((a, b) => b.grossProfit - a.grossProfit)
  }, [saleItems])

  const productTotals = useMemo(() => {
    const revenue = productRows.reduce((s, r) => s + r.revenue, 0)
    const cogs = productRows.reduce((s, r) => s + r.cogs, 0)
    const gp = revenue - cogs
    const margin = revenue > 0 ? (gp / revenue) * 100 : 0
    const qtySold = productRows.reduce((s, r) => s + r.qtySold, 0)
    return { revenue, cogs, grossProfit: gp, margin, qtySold }
  }, [productRows])

  function marginClass(m: number): string {
    if (m >= 30) return "text-green-600 font-medium"
    if (m >= 15) return "text-amber-600 font-medium"
    return "text-red-600 font-medium"
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* 1. Page header */}
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm">
          Financial overview for your shop
        </p>
      </div>

      {/* 2. Date range picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">From</label>
        <input
          type="date"
          value={localStart}
          max={localEnd}
          onChange={(e) => setLocalStart(e.target.value)}
          className="h-9 border rounded px-3 text-sm"
        />
        <label className="text-sm font-medium">To</label>
        <input
          type="date"
          value={localEnd}
          min={localStart}
          onChange={(e) => setLocalEnd(e.target.value)}
          className="h-9 border rounded px-3 text-sm"
        />
        <button
          onClick={handleApply}
          className="bg-primary text-primary-foreground rounded px-4 h-9 text-sm hover:opacity-90 transition-opacity"
        >
          Apply
        </button>
      </div>

      {/* 3. KPI section */}
      <div className="grid lg:grid-cols-[3fr_1fr] gap-4">
        {/* Left sub-grid */}
        <div className="space-y-4">
          {/* Revenue Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Revenue"
              value={formatCurrency(totalRevenue, currency)}
              iconBg="bg-blue-100"
              icon={<DollarSign className="h-4 w-4 text-blue-600" />}
            />
            <KpiCard
              label="Cash Sales"
              value={formatCurrency(cashRevenue, currency)}
              iconBg="bg-green-100"
              icon={<DollarSign className="h-4 w-4 text-green-600" />}
            />
            <KpiCard
              label="Mobile Sales"
              value={formatCurrency(mobileRevenue, currency)}
              iconBg="bg-blue-100"
              icon={<CreditCard className="h-4 w-4 text-blue-600" />}
            />
            <KpiCard
              label="Credit Sales"
              value={formatCurrency(creditRevenue, currency)}
              iconBg="bg-orange-100"
              icon={<ShoppingCart className="h-4 w-4 text-orange-600" />}
            />
          </div>

          {/* Profitability */}
          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              label="Total Expenses"
              value={formatCurrency(totalExpenses, currency)}
              iconBg="bg-red-100"
              icon={<Receipt className="h-4 w-4 text-red-600" />}
            />
            <div className="bg-white border rounded-lg p-4">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center mb-3 ${
                  grossProfit >= 0 ? "bg-green-100" : "bg-red-100"
                }`}
              >
                {grossProfit >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </div>
              <div
                className={`text-xl font-bold ${
                  grossProfit >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatCurrency(grossProfit, currency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Gross Profit
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="h-8 w-8 rounded-full flex items-center justify-center mb-3 bg-slate-100">
                <BarChart2 className="h-4 w-4 text-slate-600" />
              </div>
              <div
                className={`text-xl font-bold ${
                  profitMargin >= 15
                    ? "text-green-600"
                    : profitMargin >= 0
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {profitMargin.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Profit Margin
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar — Credit Position */}
        <div className="bg-white border rounded-lg p-4 flex flex-col gap-4">
          <p className="font-semibold text-sm">Credit Position</p>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1">
              Repayments Received
            </p>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency(totalRepaid, currency)}
            </p>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1">
              Outstanding Balance
            </p>
            <p
              className={`text-lg font-bold ${
                totalOutstanding > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {formatCurrency(totalOutstanding, currency)}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Charts — Row 1 */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Daily Revenue vs Profit line chart */}
        <div className="bg-white border rounded-lg p-4 lg:col-span-2">
          <p className="font-semibold text-sm mb-4">Daily Revenue vs Profit</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={dailyData}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrency(v, currency)}
                tick={{ fontSize: 10 }}
                width={80}
              />
              <Tooltip
                formatter={(v: number) => formatCurrency(v, currency)}
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
                dataKey="profit"
                name="Profit"
                stroke="#22c55e"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Expense breakdown pie */}
        <div className="bg-white border rounded-lg p-4">
          <p className="font-semibold text-sm mb-4">Expenses by Category</p>
          {expenseByCategory.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              No expense data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={expenseByCategory}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={70}
                >
                  {expenseByCategory.map((_entry, idx) => (
                    <Cell
                      key={idx}
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatCurrency(v, currency)}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts — Row 2 */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Revenue by Payment Method stacked bar */}
        <div className="bg-white border rounded-lg p-4 lg:col-span-2">
          <p className="font-semibold text-sm mb-4">
            Revenue by Payment Method
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={dailyData}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrency(v, currency)}
                tick={{ fontSize: 10 }}
                width={80}
              />
              <Tooltip
                formatter={(v: number) => formatCurrency(v, currency)}
                labelFormatter={formatAxisDate}
              />
              <Legend />
              <Bar dataKey="cash" name="Cash" stackId="a" fill="#22c55e" />
              <Bar dataKey="mobile" name="Mobile" stackId="a" fill="#3b82f6" />
              <Bar dataKey="credit" name="Credit" stackId="a" fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Reconciliation Summary */}
        <div className="bg-white border rounded-lg p-4">
          <p className="font-semibold text-sm mb-4">Quick Summary</p>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Transactions</span>
              <span className="font-medium">{reconciliation.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Transaction</span>
              <span className="font-medium">
                {formatCurrency(reconciliation.avgTransaction, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Days Active</span>
              <span className="font-medium">{reconciliation.distinctDays}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Largest Single Day</span>
              <span className="font-medium">
                {formatCurrency(reconciliation.largestDay, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Best Payment Method
              </span>
              <span className="font-bold">{reconciliation.bestMethod}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Product Profitability table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        <div className="p-4 border-b">
          <p className="font-semibold">Product Profitability</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on all recorded sale items
          </p>
        </div>

        {productRows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No product data for selected period
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-right px-4 py-3 font-medium">Revenue</th>
                <th className="text-right px-4 py-3 font-medium">COGS</th>
                <th className="text-right px-4 py-3 font-medium">
                  Gross Profit
                </th>
                <th className="text-right px-4 py-3 font-medium">Margin %</th>
                <th className="text-right px-4 py-3 font-medium">Qty Sold</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b last:border-b-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-3 font-medium">{row.productName}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(row.revenue, currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(row.cogs, currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(row.grossProfit, currency)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${marginClass(row.margin)}`}
                  >
                    {row.margin.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.qtySold.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-muted/10">
                <td className="px-4 py-3">Totals</td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(productTotals.revenue, currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(productTotals.cogs, currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(productTotals.grossProfit, currency)}
                </td>
                <td
                  className={`px-4 py-3 text-right ${marginClass(productTotals.margin)}`}
                >
                  {productTotals.margin.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right">
                  {productTotals.qtySold.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
