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
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/utils/format"
import { Loader2, Plus, Building2, RotateCcw, ShieldCheck, Receipt, Percent, X, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext, Shop } from "@/types"
import { transactionalReset, fullReset } from "./actions"
import { ReceiptPreview, type ReceiptConfig, type ReceiptSaleData } from "@/components/receipt/receipt-preview"
import { RolesTab } from "./roles-tab"

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
  rolePermissions: Record<string, Record<string, boolean>>
}

const isOwner = (session: SessionContext) => session.role === "owner"

export function SettingsClient({ shop, branches, subscription, allPlans, usage, session, rolePermissions }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("general")
  const [saving, setSaving] = useState(false)
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")
  const [newBranchAddress, setNewBranchAddress] = useState("")
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  // Danger zone
  const [txResetOpen, setTxResetOpen] = useState(false)
  const [txResetConfirm, setTxResetConfirm] = useState("")
  const [txResetLoading, setTxResetLoading] = useState(false)
  const [fullResetOpen, setFullResetOpen] = useState(false)
  const [fullResetConfirm, setFullResetConfirm] = useState("")
  const [fullResetLoading, setFullResetLoading] = useState(false)

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
  const [receiptFormat,      setReceiptFormat]      = useState<"a4" | "thermal_58" | "thermal_80">(shop?.receipt_format ?? "a4")
  const [receiptHeader,      setReceiptHeader]      = useState(shop?.receipt_header ?? "Thank you for your purchase!")
  const [receiptFooter,      setReceiptFooter]      = useState(shop?.receipt_footer ?? "")
  const [receiptShowLogo,    setReceiptShowLogo]    = useState(shop?.receipt_show_logo ?? true)
  const [receiptShowBranch,  setReceiptShowBranch]  = useState(shop?.receipt_show_branch ?? false)
  const [receiptPrefix,      setReceiptPrefix]      = useState(shop?.receipt_number_prefix ?? "")
  const [savingReceipt,      setSavingReceipt]      = useState(false)

  // Tax settings (separate tab — taxes affect sales calculations, not just display)
  const [shopTaxRates, setShopTaxRates] = useState<{ label: string; rate: number }[]>(
    Array.isArray(shop?.tax_rates) ? shop.tax_rates : []
  )
  const [savingTaxes, setSavingTaxes] = useState(false)

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
      receipt_format:        receiptFormat,
      receipt_header:        receiptHeader,
      receipt_footer:        receiptFooter,
      receipt_show_logo:     receiptShowLogo,
      receipt_show_branch:   receiptShowBranch,
      receipt_number_prefix: receiptPrefix,
    }).eq("id", session.shop_id!)
    setSavingReceipt(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Receipt settings saved")
    }
  }

  async function saveTaxSettings() {
    setSavingTaxes(true)
    const supabase = createClient()
    const { error } = await supabase.from("shops").update({
      tax_rates: shopTaxRates,
    }).eq("id", session.shop_id!)
    setSavingTaxes(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Tax settings saved")
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

  async function handleTransactionalReset() {
    if (!shop || txResetConfirm !== shop.name) return
    setTxResetLoading(true)
    try {
      await transactionalReset(session.shop_id!)
      toast.success("Transactional data cleared successfully")
      setTxResetOpen(false)
      setTxResetConfirm("")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed")
    } finally {
      setTxResetLoading(false)
    }
  }

  async function handleFullReset() {
    if (!shop || fullResetConfirm !== shop.name) return
    setFullResetLoading(true)
    try {
      await fullReset(session.shop_id!)
      toast.success("Shop has been fully reset")
      setFullResetOpen(false)
      setFullResetConfirm("")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed")
    } finally {
      setFullResetLoading(false)
    }
  }

  return (
    <div className="-m-4 md:-m-6">

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">

        {/* ── Sticky tab bar ── */}
        <div className="sticky -top-4 md:-top-6 z-20 bg-background border-b border-border">
          <div className="flex gap-1 px-4 md:px-6 overflow-x-auto scrollbar-none">
            {([...(["general", "branches", "roles", "taxes", "receipt", "billing", "security"] as const), ...(canEditSettings ? (["danger"] as const) : [])] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors -mb-px capitalize whitespace-nowrap shrink-0 ${
                  activeTab === tab
                    ? tab === "danger"
                      ? "border-destructive text-destructive"
                      : "border-primary text-primary"
                    : tab === "danger"
                    ? "border-transparent text-destructive/70 hover:text-destructive"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "danger" ? (
                  <span className="flex items-center gap-1.5">
                    <TriangleAlert className="size-3.5" />
                    Danger Zone
                  </span>
                ) : tab}
              </button>
            ))}
          </div>
        </div>

        {/* General */}
        <TabsContent value="general" className="space-y-4 mt-0 px-4 md:px-6 py-6 max-w-2xl">
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
        <TabsContent value="branches" className="space-y-4 mt-0 px-4 md:px-6 py-6 max-w-2xl">
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

        {/* Roles */}
        <TabsContent value="roles" className="mt-0 px-4 md:px-6 py-6">
          {canEditSettings ? (
            <RolesTab savedPermissions={rolePermissions} />
          ) : (
            <p className="text-sm text-muted-foreground">Only the shop owner can configure role permissions.</p>
          )}
        </TabsContent>

        {/* Taxes */}
        <TabsContent value="taxes" className="space-y-4 mt-0 px-4 md:px-6 py-6 max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Tax Rates</CardTitle>
              </div>
              <CardDescription>
                Taxes are applied on top of item prices at checkout and recorded with each sale.
                They appear as separate lines on printed receipts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {shopTaxRates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No taxes configured. Add a tax rate below to start charging tax on sales.
                </p>
              ) : (
                <div className="space-y-2">
                  {shopTaxRates.map((tax, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={tax.label}
                        onChange={(e) => setShopTaxRates((prev) => prev.map((t, j) => j === i ? { ...t, label: e.target.value } : t))}
                        placeholder="e.g. VAT, Sales Tax"
                        className="h-9 flex-1"
                        disabled={!canEditSettings}
                      />
                      <div className="relative w-24 shrink-0">
                        <Input
                          type="number" min={0} max={100} step="0.01"
                          value={tax.rate || ""}
                          onChange={(e) => setShopTaxRates((prev) => prev.map((t, j) => j === i ? { ...t, rate: parseFloat(e.target.value) || 0 } : t))}
                          placeholder="0"
                          className="h-9 pr-7"
                          disabled={!canEditSettings}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                      </div>
                      {canEditSettings && (
                        <button
                          onClick={() => setShopTaxRates((prev) => prev.filter((_, j) => j !== i))}
                          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEditSettings && (
                <button
                  onClick={() => setShopTaxRates((prev) => [...prev, { label: "", rate: 0 }])}
                  className="text-sm text-primary hover:underline"
                >
                  + Add tax rate
                </button>
              )}

              {canEditSettings && (
                <Button onClick={saveTaxSettings} disabled={savingTaxes} size="sm">
                  {savingTaxes && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Save Tax Rates
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receipt */}
        <TabsContent value="receipt" className="mt-0 px-4 md:px-6 py-6">
          {(() => {
            // Mock sale for live preview — apply current tax rates to show realistic totals
            const previewItemsSubtotal = 125.50
            const previewTaxLines = shopTaxRates
              .filter((t) => t.rate > 0)
              .map((t) => ({ label: t.label, rate: t.rate, amount: previewItemsSubtotal * t.rate / 100 }))
            const previewTaxesTotal = previewTaxLines.reduce((s, t) => s + t.amount, 0)

            const mockSale: ReceiptSaleData = {
              id: "preview-0000000001",
              saleDate: new Date().toISOString().split("T")[0],
              createdAt: new Date().toISOString(),
              paymentMethod: "cash",
              totalAmount: previewItemsSubtotal + previewTaxesTotal,
              recordedByName: "Jane Doe",
              notes: null,
              branchId: "",
              taxesSnapshot: previewTaxLines,
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
              showBranch: receiptShowBranch,
              shopName: shopName,
              shopLogoUrl: shop?.logo_url ?? null,
              branchName: "Main Branch",        // placeholder so preview matches real receipts
              branchAddress: null,
              currency,
              receiptPrefix: receiptPrefix,
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

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">Show Branch Name</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Display branch name &amp; address</p>
                    </div>
                    <Switch checked={receiptShowBranch} onCheckedChange={setReceiptShowBranch} />
                  </div>

                  {/* Receipt number prefix */}
                  <div className="space-y-1.5 border-t pt-3">
                    <Label className="text-xs">Receipt No. Prefix</Label>
                    <Input
                      value={receiptPrefix}
                      onChange={(e) => setReceiptPrefix(e.target.value)}
                      placeholder="e.g. INV- or REC-"
                      className="h-8 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Preview: #{receiptPrefix || ""}AB1234C5DE
                    </p>
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
        <TabsContent value="billing" className="space-y-4 mt-0 px-4 md:px-6 py-6 max-w-2xl">
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
        <TabsContent value="security" className="space-y-4 mt-0 px-4 md:px-6 py-6 max-w-2xl">
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

        {/* ── Danger Zone ── */}
        {canEditSettings && (
          <TabsContent value="danger" className="space-y-4 mt-0 px-4 md:px-6 py-6 max-w-2xl">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-5 py-4 flex items-start gap-3">
              <TriangleAlert className="size-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                Actions in this section are <strong>permanent and irreversible</strong>. There is no undo. Proceed only if you are absolutely sure.
              </p>
            </div>

            {/* Transactional Reset */}
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-sm">Transactional Reset</CardTitle>
                <CardDescription>
                  Wipes all operational data while keeping your shop structure intact.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-1">
                  <p className="font-medium text-foreground mb-2">What gets deleted:</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>All sales and sale line items</li>
                    <li>All credit records and payment history</li>
                    <li>All reconciliations</li>
                    <li>All expenses</li>
                    <li>All stock adjustments, restocks, and transfers</li>
                    <li>All stock audit records</li>
                    <li>Stock levels reset to zero on all products</li>
                  </ul>
                  <p className="font-medium text-foreground mt-3 mb-2">What is kept:</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>Shop settings and branches</li>
                    <li>Staff accounts and roles</li>
                    <li>Product catalogue</li>
                    <li>Customer list</li>
                    <li>Audit log (a reset entry will be recorded)</li>
                  </ul>
                </div>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={() => { setTxResetConfirm(""); setTxResetOpen(true) }}
                >
                  Reset Transactional Data…
                </Button>
              </CardContent>
            </Card>

            {/* Full Reset */}
            <Card className="border-destructive/60 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-sm text-destructive">Full Reset</CardTitle>
                <CardDescription>
                  Returns the shop to the state it was in immediately after initial setup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-1">
                  <p className="font-medium text-foreground mb-2">Everything in Transactional Reset, plus:</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>All customers are deleted</li>
                    <li>The entire audit log is wiped</li>
                  </ul>
                  <p className="font-medium text-foreground mt-3 mb-2">What is kept:</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>Shop settings and branches</li>
                    <li>Staff accounts and roles</li>
                    <li>Product catalogue (stock reset to zero)</li>
                  </ul>
                </div>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={() => { setFullResetConfirm(""); setFullResetOpen(true) }}
                >
                  Full Reset…
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

      </Tabs>

      {/* ── Transactional Reset Dialog ── */}
      <Dialog open={txResetOpen} onOpenChange={(o) => { if (!o) { setTxResetOpen(false); setTxResetConfirm("") } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-4" />
              Reset Transactional Data?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all sales, credit records, reconciliations, expenses, and stock movements.
              Stock levels will be set to zero. <strong className="text-foreground">This cannot be undone.</strong>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="tx-confirm">
                Type <span className="font-semibold text-foreground">{shop?.name}</span> to confirm
              </Label>
              <Input
                id="tx-confirm"
                value={txResetConfirm}
                onChange={(e) => setTxResetConfirm(e.target.value)}
                placeholder={shop?.name ?? ""}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setTxResetOpen(false); setTxResetConfirm("") }} disabled={txResetLoading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={txResetConfirm !== shop?.name || txResetLoading}
                onClick={handleTransactionalReset}
              >
                {txResetLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Reset Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Full Reset Dialog ── */}
      <Dialog open={fullResetOpen} onOpenChange={(o) => { if (!o) { setFullResetOpen(false); setFullResetConfirm("") } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-4" />
              Full Reset?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all operational data, customers, and the entire audit log.
              Your shop will be returned to its initial setup state.{" "}
              <strong className="text-foreground">This cannot be undone.</strong>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="full-confirm">
                Type <span className="font-semibold text-foreground">{shop?.name}</span> to confirm
              </Label>
              <Input
                id="full-confirm"
                value={fullResetConfirm}
                onChange={(e) => setFullResetConfirm(e.target.value)}
                placeholder={shop?.name ?? ""}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setFullResetOpen(false); setFullResetConfirm("") }} disabled={fullResetLoading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={fullResetConfirm !== shop?.name || fullResetLoading}
                onClick={handleFullReset}
              >
                {fullResetLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Full Reset Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
