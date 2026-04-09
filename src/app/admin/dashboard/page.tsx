import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { StatCard } from "@/components/shared/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Users, TrendingUp, AlertTriangle } from "lucide-react"
import { formatDate } from "@/utils/format"

export default async function AdminDashboardPage() {
  const admin = createAdminClient()

  const [
    { count: totalShops },
    { count: activeShops },
    { count: totalUsers },
    { data: recentShops },
    { data: planDistrib },
  ] = await Promise.all([
    admin.from("shops").select("*", { count: "exact", head: true }),
    admin.from("shops").select("*", { count: "exact", head: true }).eq("status", "active"),
    admin.from("shop_members").select("*", { count: "exact", head: true }).eq("status", "active"),
    admin.from("shops").select("id, name, status, created_at, plan:plans(name)").order("created_at", { ascending: false }).limit(10),
    admin.from("shop_subscriptions").select("plan:plans(name)"),
  ])

  const planCounts: Record<string, number> = {}
  for (const sub of planDistrib ?? []) {
    const name = (sub.plan as unknown as unknown as { name: string } | null)?.name ?? "Unknown"
    planCounts[name] = (planCounts[name] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Platform Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Shops" value={String(totalShops ?? 0)} icon={<Building2 className="h-4 w-4" />} />
        <StatCard title="Active Shops" value={String(activeShops ?? 0)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard title="Total Users" value={String(totalUsers ?? 0)} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Plans Active" value={String(Object.keys(planCounts).length)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Shops</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {(recentShops ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{(s.plan as unknown as { name: string } | null)?.name ?? "Free"}</Badge>
                    <Badge variant={s.status === "active" ? "secondary" : "destructive"} className="text-xs capitalize">{s.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {Object.entries(planCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <div key={name} className="flex items-center justify-between py-2 text-sm">
                  <span>{name}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {Object.keys(planCounts).length === 0 && (
                <p className="text-sm text-muted-foreground py-4">No subscriptions yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
