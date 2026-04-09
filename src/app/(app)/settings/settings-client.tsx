"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/utils/format"
import { Loader2, Plus, Building2 } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext, Shop } from "@/types"

interface PlanOption {
  id: string
  name: string
  price_monthly: number
  max_branches: number
  max_users: number
  max_products: number
  max_customers: number
  feature_flags: Record<string, boolean>
}

interface Props {
  shop: Shop | null
  branches: Array<{ id: string; name: string; address: string | null; status: string }>
  subscription: { plan: { name: string; max_branches: number; max_users: number; max_products: number; max_customers: number; price_monthly: number; feature_flags: Record<string, boolean> } } | null
  allPlans: PlanOption[]
  usage: { users: number; branches: number; products: number; customers: number }
  session: SessionContext
}

const isOwner = (session: SessionContext) => session.role === "owner"

export function SettingsClient({ shop, branches, subscription, allPlans, usage, session }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")
  const [newBranchAddress, setNewBranchAddress] = useState("")
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  // General settings form
  const [shopName, setShopName] = useState(shop?.name ?? "")
  const [currency, setCurrency] = useState(shop?.currency ?? "USD")
  const [creditOverdueDays, setCreditOverdueDays] = useState(String(shop?.credit_overdue_days ?? 30))
  const [reconTolerance, setReconTolerance] = useState(String(shop?.recon_tolerance ?? 0))
  const [pricingMode, setPricingMode] = useState(shop?.pricing_mode ?? "uniform")
  const [primaryColour, setPrimaryColour] = useState(shop?.primary_colour ?? "#000000")

  const plan = subscription?.plan
  const canEditSettings = isOwner(session)

  async function saveGeneral() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from("shops").update({
      name: shopName,
      currency,
      credit_overdue_days: parseInt(creditOverdueDays),
      recon_tolerance: parseFloat(reconTolerance),
      pricing_mode: pricingMode,
      primary_colour: primaryColour,
    }).eq("id", session.shop_id!)
    if (error) {
      toast.error(error.message)
      setSaving(false)
    } else {
      toast.success("Settings saved")
      window.location.reload()
    }
  }

  async function createBranch() {
    if (!newBranchName.trim()) {
      toast.error("Enter a branch name")
      return
    }
    if (plan && usage.branches >= plan.max_branches) {
      toast.error(`Branch limit reached (${usage.branches}/${plan.max_branches}). Upgrade your plan to add more branches.`)
      return
    }
    setCreatingBranch(true)
    const supabase = createClient()
    const { error } = await supabase.from("branches").insert({
      shop_id: session.shop_id,
      name: newBranchName.trim(),
      address: newBranchAddress || null,
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Branch created")
      setBranchDialogOpen(false)
      setNewBranchName("")
      setNewBranchAddress("")
      router.refresh()
    }
    setCreatingBranch(false)
  }

  async function handleUpgrade(planId: string) {
    setUpgrading(planId)
    const supabase = createClient()

    const [{ error: subError }, { error: shopError }] = await Promise.all([
      supabase
        .from("shop_subscriptions")
        .update({ plan_id: planId, status: "active" })
        .eq("shop_id", session.shop_id!),
      supabase
        .from("shops")
        .update({ plan_id: planId })
        .eq("id", session.shop_id!),
    ])

    const error = subError ?? shopError
    if (error) {
      toast.error(error.message)
      setUpgrading(null)
    } else {
      toast.success("Plan updated")
      setUpgradeOpen(false)
      window.location.reload()
    }
  }

  async function deactivateBranch(id: string) {
    const supabase = createClient()
    await supabase.from("branches").update({ status: "inactive" }).eq("id", id)
    toast.success("Branch deactivated")
    router.refresh()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Shop Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Shop Name</Label>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} disabled={!canEditSettings} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v ?? "")} disabled={!canEditSettings}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "NGN", "GHS", "KES", "ZAR"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pricing Mode</Label>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={pricingMode === "branch"}
                    onCheckedChange={(v) => setPricingMode(v ? "branch" : "uniform")}
                    disabled={!canEditSettings}
                  />
                  <span className="text-sm">
                    {pricingMode === "branch" ? "Branch-level pricing" : "Uniform pricing across all branches"}
                  </span>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Credit Overdue Threshold (days)</Label>
                  <Input type="number" min={1} value={creditOverdueDays} onChange={(e) => setCreditOverdueDays(e.target.value)} disabled={!canEditSettings} />
                </div>
                <div className="space-y-2">
                  <Label>Reconciliation Tolerance</Label>
                  <Input type="number" min={0} step="any" value={reconTolerance} onChange={(e) => setReconTolerance(e.target.value)} disabled={!canEditSettings} />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Primary Colour</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={primaryColour} onChange={(e) => setPrimaryColour(e.target.value)} disabled={!canEditSettings} className="h-9 w-9 rounded border p-0.5 cursor-pointer" />
                  <Input value={primaryColour} onChange={(e) => setPrimaryColour(e.target.value)} className="flex-1" disabled={!canEditSettings} />
                </div>
              </div>
              {canEditSettings && (
                <Button onClick={saveGeneral} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branches */}
        <TabsContent value="branches" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{branches.filter((b) => b.status === "active").length} active branch(es)</p>
            {canEditSettings && (
              <Button size="sm" onClick={() => setBranchDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Branch
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {branches.map((b) => (
              <Card key={b.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{b.name}</p>
                        {b.address && <p className="text-xs text-muted-foreground truncate">{b.address}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={b.status === "active" ? "outline" : "secondary"} className="text-xs capitalize">{b.status}</Badge>
                      {canEditSettings && b.status === "active" && branches.filter((x) => x.status === "active").length > 1 && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => deactivateBranch(b.id)}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Current Plan</CardTitle>
              <CardDescription>{plan?.name ?? "Free"} · {plan?.price_monthly ? formatCurrency(plan.price_monthly, shop?.currency ?? "USD") + "/mo" : "Free"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan && (
                <div className="space-y-3">
                  {[
                    { label: "Users", used: usage.users, max: plan.max_users },
                    { label: "Branches", used: usage.branches, max: plan.max_branches },
                    { label: "Products", used: usage.products, max: plan.max_products },
                    { label: "Customers", used: usage.customers, max: plan.max_customers },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">{item.used} / {item.max}</span>
                      </div>
                      <Progress value={(item.used / item.max) * 100} className="h-1.5" />
                    </div>
                  ))}
                </div>
              )}
              {canEditSettings && allPlans.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}>
                  Change Plan
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Branch</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Branch Name</Label>
              <Input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="Branch name" />
            </div>
            <div className="space-y-2">
              <Label>Address <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={newBranchAddress} onChange={(e) => setNewBranchAddress(e.target.value)} placeholder="123 Main St" />
            </div>
            <Button onClick={createBranch} disabled={creatingBranch} className="w-full">
              {creatingBranch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Branch
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan upgrade dialog */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Change Plan</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            {allPlans.map((p) => {
              const isCurrent = plan?.name === p.name
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-4 space-y-3 ${isCurrent ? "border-foreground bg-muted" : "hover:border-foreground/50 transition-colors"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.price_monthly === 0 ? "Free" : `${formatCurrency(p.price_monthly, shop?.currency ?? "USD")}/mo`}
                      </p>
                    </div>
                    {isCurrent && <Badge variant="secondary" className="text-xs">Current</Badge>}
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>{p.max_branches} branch(es)</li>
                    <li>{p.max_users} users</li>
                    <li>{p.max_products} products</li>
                    <li>{p.max_customers} customers</li>
                    {Object.entries(p.feature_flags ?? {}).filter(([, v]) => v).map(([k]) => (
                      <li key={k} className="capitalize">{k.replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={upgrading === p.id}
                      onClick={() => handleUpgrade(p.id)}
                    >
                      {upgrading === p.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      {(plan?.price_monthly ?? 0) < p.price_monthly ? "Upgrade" : "Downgrade"}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
