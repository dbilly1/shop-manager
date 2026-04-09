import { createClient } from "@/lib/supabase/server"
import { StatCard } from "@/components/shared/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LinkButton } from "@/components/ui/link-button"
import { formatCurrency, formatDate, formatPaymentMethod } from "@/utils/format"
import { ShoppingCart, Receipt, Sliders, TrendingUp, AlertTriangle, Users } from "lucide-react"
import type { SessionContext } from "@/types"
import { DailyChart } from "./daily-chart"

interface Props {
  session: SessionContext
}

export async function BranchDashboard({ session }: Props) {
  const supabase = await createClient()
  const branchId = session.branch_id!
  const shopId = session.shop_id!
  const today = new Date().toISOString().split("T")[0]

  // Today's sales
  const { data: todaySales } = await supabase
    .from("sales")
    .select("total_amount, payment_method")
    .eq("branch_id", branchId)
    .eq("sale_date", today)

  const totalToday = todaySales?.reduce((s, r) => s + r.total_amount, 0) ?? 0
  const cashToday = todaySales?.filter((r) => r.payment_method === "cash").reduce((s, r) => s + r.total_amount, 0) ?? 0
  const mobileToday = todaySales?.filter((r) => r.payment_method === "mobile").reduce((s, r) => s + r.total_amount, 0) ?? 0
  const creditToday = todaySales?.filter((r) => r.payment_method === "credit").reduce((s, r) => s + r.total_amount, 0) ?? 0
  const txCount = todaySales?.length ?? 0

  // Low stock alerts
  const { data: lowStock } = await supabase
    .from("branch_products")
    .select("*, product:products(name, unit_type, reorder_threshold)")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .limit(5)

  const lowStockItems = (lowStock ?? []).filter((bp) => {
    if (!bp.product) return false
    const qty = bp.product.unit_type === "kg" ? bp.current_stock_kg
      : bp.product.unit_type === "boxes" ? bp.current_stock_boxes
      : bp.current_stock_units
    return qty <= bp.product.reorder_threshold
  })

  // Recent sales
  const { data: recentSales } = await supabase
    .from("sales")
    .select("id, sale_date, total_amount, payment_method, created_at")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(10)

  // Last 7 days chart data
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const { data: weekSales } = await supabase
    .from("sales")
    .select("sale_date, total_amount")
    .eq("branch_id", branchId)
    .gte("sale_date", sevenDaysAgo.toISOString().split("T")[0])

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toISOString().split("T")[0]
    const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" })
    const total = (weekSales ?? [])
      .filter((s) => s.sale_date === dateStr)
      .reduce((sum, s) => sum + s.total_amount, 0)
    return { date: dayLabel, revenue: total }
  })

  // Get shop currency
  const { data: shop } = await supabase.from("shops").select("currency").eq("id", shopId).single()
  const currency = shop?.currency ?? "USD"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <LinkButton href="/sales/new" size="sm">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Record Sale
          </LinkButton>
          <LinkButton href="/expenses/new" variant="outline" size="sm">
            <Receipt className="mr-2 h-4 w-4" />
            Expense
          </LinkButton>
          <LinkButton href="/adjustments/new" variant="outline" size="sm">
            <Sliders className="mr-2 h-4 w-4" />
            Adjust Stock
          </LinkButton>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(totalToday, currency)}
          sub={`${txCount} transactions`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard title="Cash" value={formatCurrency(cashToday, currency)} />
        <StatCard title="Mobile Money" value={formatCurrency(mobileToday, currency)} />
        <StatCard title="Credit" value={formatCurrency(creditToday, currency)} />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Daily chart */}
        <div className="md:col-span-2">
          <DailyChart data={chartData} currency={currency} />
        </div>

        {/* Low stock */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">All stock levels healthy</p>
            ) : (
              lowStockItems.map((bp) => (
                <div key={bp.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{bp.product?.name}</span>
                  <Badge variant="outline" className="text-amber-600 border-amber-300 shrink-0">
                    Low
                  </Badge>
                </div>
              ))
            )}
            <LinkButton href="/inventory" variant="link" size="sm" className="p-0 h-auto mt-2">View inventory →</LinkButton>
          </CardContent>
        </Card>
      </div>

      {/* Recent sales */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recent Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {!recentSales || recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales recorded yet today</p>
          ) : (
            <div className="space-y-2">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div>
                    <span className="font-medium">{formatCurrency(sale.total_amount, currency)}</span>
                    <span className="text-muted-foreground ml-2">· {formatPaymentMethod(sale.payment_method)}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">{formatDate(sale.sale_date)}</span>
                </div>
              ))}
            </div>
          )}
          <LinkButton href="/sales" variant="link" size="sm" className="p-0 h-auto mt-3">View all sales →</LinkButton>
        </CardContent>
      </Card>
    </div>
  )
}
