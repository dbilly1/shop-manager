"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/utils/format"
import { Loader2, Plus, Building2, RotateCcw, ShieldCheck, Receipt } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext, Shop } from "@/types"
import { ReceiptPreview, type ReceiptConfig, type ReceiptSaleData } from "@/components/receipt/receipt-preview"

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

  // Security / change password
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPasswords, setShowPasswords] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState("")

  // General settings form
  const [shopName, setShopName] = useState(shop?.name ?? "")
  const [currency, setCurrency] = useState(shop?.currency ?? "USD")
  const [creditOverdueDays, setCreditOverdueDays] = useState(String(shop?.credit_overdue_days ?? 30))
  const [reconTolerance, setReconTolerance] = useState(String(shop?.recon_tolerance ?? 0))
  const [pricingMode, setPricingMode] = useState(shop?.pricing_mode ?? "uniform")
  const [primaryColour, setPrimaryColour] = useState(shop?.primary_colour || "#1b1a19")

  // Receipt settings
  const [receiptFormat, setReceiptFormat] = useState<"a4" | "thermal_58" | "thermal_80">(shop?.receipt_format ?? "a4")
  const [receiptHeader, setReceiptHeader] = useState(shop?.receipt_header ?? "Thank you for your purchase!")
  const [receiptFooter, setReceiptFooter] = useState(shop?.receipt_footer ?? "")
  const [receiptShowLogo, setReceiptShowLogo] = useState(shop?.receipt_show_logo ?? true)
  const [savingReceipt, setSavingReceipt] = useState(false)

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

  async function resetColour() {
    setPrimaryColour("#1b1a19")
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from("shops").update({
      primary_colour: "#1b1a19",
    }).eq("id", session.shop_id!)
    setSaving(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Brand colour removed")
      window.location.reload()
    }
  }

  async function saveReceiptSettings() {
    setSavingReceipt(true)
    const supabase = createClient()
    const { error } = await supabase.from("shops").update({
      receipt_format: receiptFormat,
      receipt_header: receiptHeader,
      receipt_footer: receiptFooter,
      receipt_show_logo: receiptShowLogo,
    }).eq("id", session.shop_id!)
    setSavingReceipt(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Receipt settings saved")
    }
  }

  async function createBranch() {
    if (!newBranchName.trim()) {
      toast.error("Enter a branch name")
      return
    }
    setCreatingBranch(true)
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBranchName.trim(), address: newBranchAddress || null }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? "Failed to create branch")
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

    const res = await fetch("/api/settings/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId }),
    })
    const data = await res.json()

    if (!res.ok) {
      toast.error(data.error ?? "Plan update failed")
      setUpgrading(null)
    } else {
      toast.success("Plan updated")
      setUpgradeOpen(false)
      router.refresh()
    }
  }

  async function deactivateBranch(id: string) {
    const supabase = createClient()
    await supabase.from("branches").update({ status: "inactive" }).eq("id", id)
    toast.success("Branch deactivated")
    router.refresh()
  }

  async function changePassword() {
    setPasswordError("")

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.")
      return
    }

    setChangingPassword(true)
    const supabase = createClient()

    // Re-authenticate with current password before updating
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setPasswordError("Could not verify your session. Please sign in again.")
      setChangingPassword(false)
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (authError) {
      setPasswordError("Current password is incorrect.")
      setChangingPassword(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)

    if (error) {
      setPasswordError(error.message)
    } else {
      toast.success("Password updated successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowPasswords(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="receipt">Receipt</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="space-y-4 mt-4">
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
              {plan?.feature_flags?.custom_branding !== false && (
              <div className="space-y-2">
                <Label>Primary Colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColour}
                    onChange={(e) => setPrimaryColour(e.target.value)}
                    disabled={!canEditSettings}
                    className="h-9 w-9 shrink-0 rounded border p-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <Input
                    value={primaryColour}
                    onChange={(e) => setPrimaryColour(e.target.value)}
                    className="flex-1 font-mono text-sm"
                    disabled={!canEditSettings}
                  />
                  {canEditSettings && primaryColour !== "#1b1a19" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={saving}
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Reset to default"
                      onClick={resetColour}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              )}
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

        {/* Receipt */}
        <TabsContent value="receipt" className="mt-4">
          {(() => {
            // Mock sale for live preview
            const mockSale: ReceiptSaleData = {
              id: "preview-0000000001",
              saleDate: new Date().toISOString().split("T")[0],
              createdAt: new Date().toISOString(),
              paymentMethod: "cash",
              totalAmount: 125.50,
              recordedByName: "Jane Doe",
              notes: null,
              branchId: "",
              items: [
                { productName: "Frozen Chicken Wings", unitType: "kg", quantity: 2.5, unitPrice: 28, discountAmount: 0, lineTotal: 70 },
                { productName: "Cooking Oil (5L)", unitType: "units", quantity: 2, unitPrice: 22, discountAmount: 0, lineTotal: 44 },
                { productName: "Rice (25kg bag)", unitType: "units", quantity: 1, unitPrice: 11.50, discountAmount: 0, lineTotal: 11.50 },
              ],
            }
            const previewCfg: ReceiptConfig = {
              title: "Receipt",
              format: receiptFormat,
              header: receiptHeader,
              footer: receiptFooter,
              showLogo: receiptShowLogo,
              shopName: shopName,
              shopLogoUrl: shop?.logo_url ?? null,
              branchName: null,
              branchAddress: null,
              currency,
            }
            const previewWidth = receiptFormat === "thermal_58" ? "max-w-[62mm]" : receiptFormat === "thermal_80" ? "max-w-[84mm]" : "max-w-[420px]"

            return (
              <div className="flex flex-col lg:flex-row gap-0 border rounded-lg overflow-hidden min-h-[520px]">
                {/* ── Edit panel ── */}
                <div className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r p-5 space-y-5 overflow-y-auto">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5 mb-0.5">
                      <Receipt className="h-3.5 w-3.5" /> Receipt Defaults
                    </p>
                    <p className="text-xs text-muted-foreground">Pre-filled whenever you print. Override per receipt anytime.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Format</Label>
                    <Select value={receiptFormat} onValueChange={(v) => setReceiptFormat(v as typeof receiptFormat)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a4">A4 / Letter</SelectItem>
                        <SelectItem value="thermal_80">Thermal 80mm</SelectItem>
                        <SelectItem value="thermal_58">Thermal 58mm</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {receiptFormat === "a4" ? "Standard — desktop / inkjet printers"
                        : receiptFormat === "thermal_80" ? "80mm roll — most POS printers"
                        : "58mm roll — compact POS printers"}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Header Message</Label>
                    <Textarea
                      rows={2}
                      value={receiptHeader}
                      onChange={(e) => setReceiptHeader(e.target.value)}
                      className="text-sm resize-none"
                      placeholder="e.g. Thank you for shopping with us!"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Footer Message</Label>
                    <Textarea
                      rows={2}
                      value={receiptFooter}
                      onChange={(e) => setReceiptFooter(e.target.value)}
                      className="text-sm resize-none"
                      placeholder="e.g. Returns accepted within 7 days"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Show Logo</Label>
                    <Switch checked={receiptShowLogo} onCheckedChange={setReceiptShowLogo} />
                  </div>

                  <Button onClick={saveReceiptSettings} disabled={savingReceipt} size="sm" className="w-full">
                    {savingReceipt && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save Defaults
                  </Button>
                </div>

                {/* ── Live preview ── */}
                <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
                  <p className="text-xs text-center text-muted-foreground mb-4">Live preview — updates as you type</p>
                  <div className={`${previewWidth} mx-auto shadow-sm rounded overflow-hidden border`}>
                    <ReceiptPreview sale={mockSale} cfg={previewCfg} />
                  </div>
                </div>
              </div>
            )
          })()}
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
        {/* Security */}
        <TabsContent value="security" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Change Password</CardTitle>
              </div>
              <CardDescription>
                Enter your current password to confirm your identity, then choose a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {passwordError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  {passwordError}
                </div>
              )}

              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Your current password"
                  autoComplete="current-password"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <Label>Confirm New Password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={showPasswords}
                  onCheckedChange={setShowPasswords}
                  id="show-passwords"
                />
                <Label htmlFor="show-passwords" className="cursor-pointer font-normal text-muted-foreground">
                  Show passwords
                </Label>
              </div>

              <Button
                onClick={changePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              >
                {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
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
