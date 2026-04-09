"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateTime } from "@/utils/format"
import { Bell, AlertTriangle, Package, CreditCard, CheckCircle2, Clock, XCircle } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext, AlertType, AlertStatus } from "@/types"

interface AlertWithBranch {
  id: string
  type: AlertType
  message: string
  status: AlertStatus
  created_at: string
  branch: { name: string } | null
}

const ALERT_ICONS: Record<string, React.ElementType> = {
  low_stock: Package,
  critical_stock: AlertTriangle,
  large_credit_balance: CreditCard,
  reconciliation_flagged: AlertTriangle,
  adjustment_pending: Clock,
}

interface Props {
  alerts: AlertWithBranch[]
  session: SessionContext
}

export function AlertsClient({ alerts, session }: Props) {
  const router = useRouter()
  const [updating, setUpdating] = useState<string | null>(null)

  async function updateStatus(id: string, status: AlertStatus) {
    setUpdating(id)
    const supabase = createClient()
    const { error } = await supabase.from("alerts").update({ status }).eq("id", id)
    if (error) {
      toast.error(error.message)
    } else {
      router.refresh()
    }
    setUpdating(null)
  }

  const openAlerts = alerts.filter((a) => a.status === "open")
  const acknowledgedAlerts = alerts.filter((a) => a.status === "acknowledged")
  const resolvedAlerts = alerts.filter((a) => a.status === "resolved")

  function AlertCard({ alert }: { alert: AlertWithBranch }) {
    const Icon = ALERT_ICONS[alert.type] ?? Bell
    return (
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-md bg-muted p-2 shrink-0 mt-0.5">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{alert.message}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {alert.branch && (
                    <Badge variant="outline" className="text-xs">{alert.branch.name}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDateTime(alert.created_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {alert.status === "open" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={updating === alert.id}
                    onClick={() => updateStatus(alert.id, "acknowledged")}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-green-600"
                    disabled={updating === alert.id}
                    onClick={() => updateStatus(alert.id, "resolved")}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                  </Button>
                </>
              )}
              {alert.status === "acknowledged" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-green-600"
                  disabled={updating === alert.id}
                  onClick={() => updateStatus(alert.id, "resolved")}
                >
                  Resolve
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Alerts</h1>
        {openAlerts.length > 0 && (
          <Badge variant="destructive">{openAlerts.length} open</Badge>
        )}
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open ({openAlerts.length})</TabsTrigger>
          <TabsTrigger value="acknowledged">Acknowledged ({acknowledgedAlerts.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({resolvedAlerts.length})</TabsTrigger>
        </TabsList>

        {[
          { key: "open", items: openAlerts },
          { key: "acknowledged", items: acknowledgedAlerts },
          { key: "resolved", items: resolvedAlerts },
        ].map(({ key, items }) => (
          <TabsContent key={key} value={key} className="space-y-3 mt-4">
            {items.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No {key} alerts</CardContent></Card>
            ) : (
              items.map((alert) => <AlertCard key={alert.id} alert={alert} />)
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
