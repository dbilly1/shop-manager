"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { formatCurrency } from "@/utils/format"
import { Plus, Loader2, Edit } from "lucide-react"
import { toast } from "sonner"
import type { Plan } from "@/types"

interface Props {
  plans: Plan[]
}

const FEATURE_FLAGS = [
  { key: "advanced_reports", label: "Advanced Reports" },
  { key: "stock_transfers", label: "Stock Transfers" },
  { key: "audit_log", label: "Audit Log" },
  { key: "api_access", label: "API Access" },
  { key: "custom_branding", label: "Custom Branding" },
]

export function AdminPlansClient({ plans }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState("")
  const [priceMonthly, setPriceMonthly] = useState("")
  const [priceAnnual, setPriceAnnual] = useState("")
  const [maxBranches, setMaxBranches] = useState("1")
  const [maxUsers, setMaxUsers] = useState("5")
  const [maxProducts, setMaxProducts] = useState("100")
  const [maxCustomers, setMaxCustomers] = useState("50")
  const [retentionMonths, setRetentionMonths] = useState("3")
  const [flags, setFlags] = useState<Record<string, boolean>>({
    advanced_reports: false,
    stock_transfers: false,
    audit_log: false,
    api_access: false,
    custom_branding: false,
  })

  function openCreate() {
    setEditPlan(null)
    setName("")
    setPriceMonthly("")
    setPriceAnnual("")
    setMaxBranches("1")
    setMaxUsers("5")
    setMaxProducts("100")
    setMaxCustomers("50")
    setRetentionMonths("3")
    setFlags({ advanced_reports: false, stock_transfers: false, audit_log: false, api_access: false, custom_branding: false })
    setOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditPlan(plan)
    setName(plan.name)
    setPriceMonthly(String(plan.price_monthly))
    setPriceAnnual(String(plan.price_annual))
    setMaxBranches(String(plan.max_branches))
    setMaxUsers(String(plan.max_users))
    setMaxProducts(String(plan.max_products))
    setMaxCustomers(String(plan.max_customers))
    setRetentionMonths(String(plan.data_retention_months))
    setFlags(plan.feature_flags as Record<string, boolean>)
    setOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Enter a plan name")
      return
    }
    setLoading(true)
    const method = editPlan ? "PATCH" : "POST"
    const url = editPlan ? `/api/admin/plans/${editPlan.id}` : "/api/admin/plans"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        price_monthly: parseFloat(priceMonthly) || 0,
        price_annual: parseFloat(priceAnnual) || 0,
        max_branches: parseInt(maxBranches),
        max_users: parseInt(maxUsers),
        max_products: parseInt(maxProducts),
        max_customers: parseInt(maxCustomers),
        data_retention_months: parseInt(retentionMonths),
        feature_flags: flags,
      }),
    })

    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? "Failed")
    } else {
      toast.success(editPlan ? "Plan updated" : "Plan created")
      setOpen(false)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Plans</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Plan
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{plan.name}</CardTitle>
                <div className="flex items-center gap-1">
                  <Badge variant={plan.is_active ? "secondary" : "outline"} className="text-xs">{plan.is_active ? "Active" : "Inactive"}</Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(plan)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <p className="text-lg font-bold">{plan.price_monthly === 0 ? "Free" : formatCurrency(plan.price_monthly, "USD") + "/mo"}</p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{plan.max_branches} branches · {plan.max_users} users · {plan.max_products} products</p>
              <div className="flex flex-wrap gap-1">
                {FEATURE_FLAGS.filter((f) => plan.feature_flags[f.key]).map((f) => (
                  <Badge key={f.key} variant="outline" className="text-xs">{f.label}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editPlan ? "Edit Plan" : "New Plan"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Monthly Price</Label>
                <Input type="number" min={0} step="0.01" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Annual Price</Label>
                <Input type="number" min={0} step="0.01" value={priceAnnual} onChange={(e) => setPriceAnnual(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Branches</Label>
                <Input type="number" min={1} value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Users</Label>
                <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Products</Label>
                <Input type="number" min={1} value={maxProducts} onChange={(e) => setMaxProducts(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Customers</Label>
                <Input type="number" min={1} value={maxCustomers} onChange={(e) => setMaxCustomers(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data Retention (months)</Label>
                <Input type="number" min={1} value={retentionMonths} onChange={(e) => setRetentionMonths(e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">Feature Flags</p>
              {FEATURE_FLAGS.map((f) => (
                <div key={f.key} className="flex items-center justify-between">
                  <Label className="font-normal">{f.label}</Label>
                  <Switch checked={!!flags[f.key]} onCheckedChange={(v) => setFlags((prev) => ({ ...prev, [f.key]: v }))} />
                </div>
              ))}
            </div>
            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editPlan ? "Save Changes" : "Create Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
