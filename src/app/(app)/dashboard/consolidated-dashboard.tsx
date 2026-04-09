import { createClient } from "@/lib/supabase/server"
import { StatCard } from "@/components/shared/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/utils/format"
import { TrendingUp, Receipt, CreditCard, AlertTriangle } from "lucide-react"
import type { SessionContext } from "@/types"

interface Props {
  session: SessionContext
}

export async function ConsolidatedDashboard({ session }: Props) {
  const supabase = await createClient()
  const shopId = session.shop_id!
  const today = new Date().toISOString().split("T")[0]

  const [{ data: branches }, { data: shop }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("shop_id", shopId).eq("status", "active"),
    supabase.from("shops").select("currency").eq("id", shopId).single(),
  ])

  const currency = shop?.currency ?? "USD"

  // Today's sales across all branches
  const { data: todaySales } = await supabase
    .from("sales")
    .select("total_amount, payment_method, branch_id")
    .eq("shop_id", shopId)
    .eq("sale_date", today)

  const totalRevenue = todaySales?.reduce((s, r) => s + r.total_amount, 0) ?? 0

  // Today's expenses
  const { data: todayExpenses } = await supabase
    .from("expenses")
    .select("amount")
    .eq("shop_id", shopId)
    .eq("expense_date", today)
  const totalExpenses = todayExpenses?.reduce((s, r) => s + r.amount, 0) ?? 0

  // Outstanding credit
  const { data: creditData } = await supabase
    .from("credit_sales")
    .select("balance")
    .eq("shop_id", shopId)
  const outstandingCredit = creditData?.reduce((s, r) => s + r.balance, 0) ?? 0

  // Open alerts
  const { count: alertCount } = await supabase
    .from("alerts")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("status", "open")

  // Revenue by branch
  const branchRevenue = (branches ?? []).map((b) => {
    const rev = (todaySales ?? [])
      .filter((s) => s.branch_id === b.id)
      .reduce((sum, s) => sum + s.total_amount, 0)
    return { ...b, revenue: rev }
  }).sort((a, b) => b.revenue - a.revenue)

  // Recent activity across all branches
  const { data: recentSales } = await supabase
    .from("sales")
    .select("id, total_amount, payment_method, sale_date, branch_id, branches(name)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(8)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Consolidated Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(totalRevenue, currency)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Today's Expenses"
          value={formatCurrency(totalExpenses, currency)}
          icon={<Receipt className="h-4 w-4" />}
        />
        <StatCard
          title="Outstanding Credit"
          value={formatCurrency(outstandingCredit, currency)}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          title="Open Alerts"
          value={String(alertCount ?? 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Branch performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Revenue by Branch — Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {branchRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No branches found</p>
            ) : (
              branchRevenue.map((b, i) => (
                <div key={b.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {i === 0 && <Badge variant="outline" className="text-xs">Top</Badge>}
                      <span className={i === 0 ? "font-medium" : ""}>{b.name}</span>
                    </div>
                    <span className="font-medium">{formatCurrency(b.revenue, currency)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground rounded-full transition-all"
                      style={{
                        width: totalRevenue > 0 ? `${(b.revenue / totalRevenue) * 100}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentSales || recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div className="min-w-0">
                      <span className="font-medium">{formatCurrency(sale.total_amount, currency)}</span>
                      <span className="text-muted-foreground ml-1 text-xs truncate">
                        · {(sale.branches as unknown as { name: string } | null)?.name}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0 capitalize">
                      {sale.payment_method}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
