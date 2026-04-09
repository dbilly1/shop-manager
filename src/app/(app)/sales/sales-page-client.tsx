"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/utils/format"
import {
  ShoppingCart, Layers, Plus, X, CalendarDays, Loader2,
  TrendingUp, TrendingDown, Minus, ChevronRight, ChevronDown, ArrowLeft,
  Pencil, Trash2,
} from "lucide-react"
import { toast } from "sonner"
import type { SessionContext } from "@/types"
import { canBackdateSales } from "@/lib/permissions"
import { BulkEntryDialog } from "./bulk/bulk-sale-form"

interface BranchProduct {
  id: string
  branch_id: string
  override_price: number | null
  current_stock_kg: number
  current_stock_units: number
  current_stock_boxes: number
  product: { id: string; name: string; unit_type: string; base_price: number; cost_price: number } | null
}

interface SaleLineItem {
  branch_product_id: string
  product_id: string
  product_name: string
  unit_type: string
  unit_price: number
  quantity: number
  boxes: number
  discount: number
  cost_price: number
}

interface DailySummary {
  sale_date: string
  total: number
  cash: number
  mobile: number
  credit: number
  count: number
  recon: { cash_variance: number; mobile_variance: number; status: string } | null
}

interface SaleItem {
  id: string
  quantity_kg: number
  quantity_units: number
  quantity_boxes: number
  unit_price: number
  line_total: number
  product: { name: string; unit_type: string } | null
}

interface IndividualSale {
  id: string
  total_amount: number
  payment_method: string
  created_at: string
  recorded_by: string
  recorded_by_name: string | null
  notes: string | null
  batch_id: string | null
  sale_items: SaleItem[]
}

interface Props {
  summaries: DailySummary[]
  branchProducts: BranchProduct[]
  customers: { id: string; name: string; phone: string | null }[]
  currency: string
  session: SessionContext
  branches: { id: string; name: string }[]
}

const TODAY = new Date().toISOString().split("T")[0]

function paymentBadge(method: string) {
  if (method === "cash") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-[10px] px-1.5 py-0">Cash</Badge>
  if (method === "mobile") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-[10px] px-1.5 py-0">Mobile</Badge>
  return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-[10px] px-1.5 py-0">Credit</Badge>
}

function getQtyDisplay(item: SaleItem) {
  const ut = item.product?.unit_type ?? "units"
  if (ut === "kg" && item.quantity_kg > 0) return `${item.quantity_kg} kg`
  if (ut === "boxes" && item.quantity_boxes > 0) return `${item.quantity_boxes} boxes`
  return `${item.quantity_units} units`
}

function SaleCard({
  sale, currency, deletingId, onDelete,
}: {
  sale: IndividualSale
  currency: string
  deletingId: string | null
  onDelete: () => void
}) {
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  }
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{formatCurrency(sale.total_amount, currency)}</span>
          {paymentBadge(sale.payment_method)}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            disabled={deletingId === sale.id}
            className="h-6 w-6 rounded flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deletingId === sale.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatTime(sale.created_at)} · {sale.recorded_by_name ?? sale.recorded_by.slice(0, 8)}
      </p>
      {sale.sale_items.length > 0 && (
        <div className="space-y-0.5">
          {sale.sale_items.map((item, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">{item.product?.name ?? "—"} × {getQtyDisplay(item)}</span>
              <span className="tabular-nums">{formatCurrency(item.line_total, currency)}</span>
            </div>
          ))}
        </div>
      )}
      {sale.notes && <p className="text-[11px] text-muted-foreground italic">{sale.notes}</p>}
    </div>
  )
}

function EditSaleDialog({
  sale, currency, onClose, onSave,
}: {
  sale: IndividualSale
  currency: string
  onClose: () => void
  onSave: (id: string, patch: { payment_method?: string; notes?: string | null }) => Promise<void>
}) {
  const [paymentMethod, setPaymentMethod] = useState(sale.payment_method)
  const [notes, setNotes] = useState(sale.notes ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(sale.id, {
      payment_method: paymentMethod,
      notes: notes.trim() || null,
    })
    setSaving(false)
  }

  const time = new Date(sale.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Sale</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Sale summary (read-only) */}
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span>{time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold">{formatCurrency(sale.total_amount, currency)}</span>
            </div>
            {sale.sale_items.length > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="text-right">{sale.sale_items.map((i) => i.product?.name).filter(Boolean).join(", ")}</span>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {[{ v: "cash", l: "Cash" }, { v: "mobile", l: "Mobile Money" }, { v: "credit", l: "Credit" }].map((m) => (
                <button
                  key={m.v}
                  onClick={() => setPaymentMethod(m.v)}
                  className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
                    paymentMethod === m.v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted border-border"
                  }`}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SalesPageClient({ summaries, branchProducts, customers: initialCustomers, currency, session, branches }: Props) {
  const router = useRouter()
  const isSalesperson = session.role === "salesperson"
  const canBackdate = session.role ? canBackdateSales(session.role) : false

  // Left panel
  const [lines, setLines] = useState<SaleLineItem[]>([])
  const [selectedBpId, setSelectedBpId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [customerId, setCustomerId] = useState("")
  const [saleDate, setSaleDate] = useState(TODAY)
  const [notes, setNotes] = useState("")
  const [saleDiscount, setSaleDiscount] = useState(0)
  const [selectedBranchId, setSelectedBranchId] = useState(session.branch_id ?? "")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [customers, setCustomers] = useState(initialCustomers)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [addingCustomer, setAddingCustomer] = useState(false)

  // Right panel
  const [todaySales, setTodaySales] = useState<IndividualSale[]>([])
  const [todayLoading, setTodayLoading] = useState(isSalesperson)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dateSales, setDateSales] = useState<IndividualSale[]>([])
  const [dateLoading, setDateLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingSale, setEditingSale] = useState<IndividualSale | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())

  const fetchSalesForDate = useCallback(async (date: string): Promise<IndividualSale[]> => {
    const supabase = createClient()
    const branchId = session.branch_id ?? selectedBranchId
    let q = supabase
      .from("sales")
      .select("id, total_amount, payment_method, created_at, recorded_by, recorded_by_name, notes, batch_id, sale_items(id, quantity_kg, quantity_units, quantity_boxes, unit_price, line_total, product:products(name, unit_type))")
      .eq("shop_id", session.shop_id!)
      .eq("sale_date", date)
      .order("created_at", { ascending: false })
    if (branchId) q = q.eq("branch_id", branchId)
    const { data } = await q
    return (data ?? []) as unknown as IndividualSale[]
  }, [session.shop_id, session.branch_id, selectedBranchId])

  const loadTodaySales = useCallback(async () => {
    if (!isSalesperson) return
    setTodayLoading(true)
    const sales = await fetchSalesForDate(TODAY)
    setTodaySales(sales)
    setTodayLoading(false)
  }, [isSalesperson, fetchSalesForDate])

  useEffect(() => { loadTodaySales() }, [loadTodaySales])

  async function handleDateClick(date: string) {
    setSelectedDate(date)
    setDateLoading(true)
    const sales = await fetchSalesForDate(date)
    setDateSales(sales)
    setDateLoading(false)
  }

  function addSelectedProduct() {
    const bp = branchProducts.find((p) => p.id === selectedBpId)
    if (!bp?.product) return
    const existing = lines.findIndex((l) => l.branch_product_id === bp.id)
    if (existing >= 0) {
      setLines((prev) => prev.map((l, i) => i === existing ? { ...l, quantity: l.quantity + 1 } : l))
      return
    }
    setLines((prev) => [...prev, {
      branch_product_id: bp.id,
      product_id: bp.product!.id,
      product_name: bp.product!.name,
      unit_type: bp.product!.unit_type,
      unit_price: bp.override_price ?? bp.product!.base_price,
      quantity: 1,
      boxes: 0,
      discount: 0,
      cost_price: bp.product!.cost_price,
    }])
  }

  function updateLine(idx: number, field: "quantity" | "unit_price" | "boxes" | "discount", value: number) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
  const total = Math.max(0, subtotal - saleDiscount)

  async function handleSubmit() {
    if (lines.length === 0) { setError("Add at least one item"); return }
    if (paymentMethod === "credit" && !customerId) { setError("Credit sales require a customer"); return }
    const branchId = session.branch_id ?? selectedBranchId
    if (!branchId) { setError("Select a branch"); return }

    setLoading(true)
    setError("")
    const supabase = createClient()

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({ shop_id: session.shop_id, branch_id: branchId, sale_date: saleDate, total_amount: total, payment_method: paymentMethod, customer_id: customerId || null, recorded_by: session.user_id, recorded_by_name: session.full_name ?? null, notes: notes || null })
      .select().single()

    if (saleError || !sale) { setError(saleError?.message ?? "Failed"); setLoading(false); return }

    const items = lines.map((l) => ({
      sale_id: sale.id, shop_id: session.shop_id, branch_id: branchId, product_id: l.product_id,
      quantity_kg: l.unit_type === "kg" ? l.quantity : 0,
      quantity_units: l.unit_type === "units" ? l.quantity : 0,
      quantity_boxes: l.unit_type === "boxes" ? l.boxes : 0,
      unit_price: l.unit_price, discount_amount: l.discount,
      line_total: l.unit_price * l.quantity - l.discount,
      cost_price_at_sale: l.cost_price,
    }))
    const { error: itemsError } = await supabase.from("sale_items").insert(items)
    if (itemsError) { setError(itemsError.message); setLoading(false); return }

    for (const l of lines) {
      const bp = branchProducts.find((p) => p.id === l.branch_product_id)
      if (!bp) continue
      const update: Record<string, number> = {}
      if (l.unit_type === "kg") update.current_stock_kg = Math.max(0, bp.current_stock_kg - l.quantity)
      else if (l.unit_type === "boxes") update.current_stock_boxes = Math.max(0, bp.current_stock_boxes - l.boxes)
      else update.current_stock_units = Math.max(0, bp.current_stock_units - l.quantity)
      await supabase.from("branch_products").update({ ...update, updated_at: new Date().toISOString() }).eq("id", bp.id)
    }

    if (paymentMethod === "credit" && customerId) {
      await supabase.from("credit_sales").insert({ shop_id: session.shop_id, branch_id: branchId, sale_id: sale.id, customer_id: customerId, amount_owed: total, amount_paid: 0, balance: total })
    }

    toast.success("Sale recorded")
    setLines([])
    setSaleDiscount(0)
    setNotes("")
    setCustomerId("")
    setPaymentMethod("cash")
    setSaleDate(TODAY)
    setLoading(false)
    if (isSalesperson) loadTodaySales()
    router.refresh()
  }

  async function addCustomer() {
    if (!newCustomerName.trim()) return
    setAddingCustomer(true)
    const supabase = createClient()
    const { data, error } = await supabase.from("customers").insert({ shop_id: session.shop_id, name: newCustomerName.trim(), phone: newCustomerPhone || null }).select().single()
    if (error) { toast.error(error.message); setAddingCustomer(false); return }
    setCustomers((prev) => [...prev, data])
    setCustomerId(data.id)
    setAddCustomerOpen(false)
    setNewCustomerName("")
    setNewCustomerPhone("")
    setAddingCustomer(false)
  }

  async function deleteSale(id: string) {
    setDeletingId(id)
    setDeleteConfirmId(null)
    const supabase = createClient()
    const { error } = await supabase.from("sales").delete().eq("id", id)
    if (error) { toast.error(error.message); setDeletingId(null); return }
    toast.success("Sale deleted")
    if (isSalesperson) setTodaySales((prev) => prev.filter((s) => s.id !== id))
    else if (selectedDate) setDateSales((prev) => prev.filter((s) => s.id !== id))
    router.refresh()
    setDeletingId(null)
  }

  async function updateSale(id: string, patch: { payment_method?: string; notes?: string | null }) {
    const supabase = createClient()
    const { error } = await supabase.from("sales").update(patch).eq("id", id)
    if (error) { toast.error(error.message); return }
    const applyPatch = (s: IndividualSale) => s.id === id ? { ...s, ...patch } : s
    if (isSalesperson) setTodaySales((prev) => prev.map(applyPatch))
    else setDateSales((prev) => prev.map(applyPatch))
    setEditingSale(null)
    toast.success("Sale updated")
    router.refresh()
  }

  function formatDateLabel(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  }

  function ReconCell({ recon }: { recon: DailySummary["recon"] }) {
    if (!recon) return <span className="text-muted-foreground text-xs">Not reconciled</span>
    const variance = recon.cash_variance + recon.mobile_variance
    if (variance === 0) return <span className="text-muted-foreground text-xs flex items-center gap-1"><Minus className="h-3 w-3" />Balanced</span>
    if (variance > 0) return <span className="text-blue-600 text-xs flex items-center gap-1"><TrendingUp className="h-3 w-3" />+{formatCurrency(variance, currency)}</span>
    return <span className="text-destructive text-xs flex items-center gap-1"><TrendingDown className="h-3 w-3" />{formatCurrency(variance, currency)}</span>
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden -m-4 md:-m-6">

      {/* ── Left: Sale Entry ── */}
      <div className="w-[420px] shrink-0 border-r flex flex-col bg-background">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">New Sale</h2>
          </div>
          {!isSalesperson && (
            <button
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1.5 text-xs text-primary border border-primary/40 rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors font-medium"
            >
              <Layers className="h-3.5 w-3.5" />
              Bulk Entry
            </button>
          )}
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}

          {!session.branch_id && branches.length > 0 && (
            <Select value={selectedBranchId} onValueChange={(v) => setSelectedBranchId(v ?? "")}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}

          {/* Product selector */}
          <div className="flex gap-2">
            <Select value={selectedBpId} onValueChange={(v) => setSelectedBpId(v ?? "")}>
              <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Select product…" /></SelectTrigger>
              <SelectContent>
                {branchProducts.map((bp) => bp.product && (
                  <SelectItem key={bp.id} value={bp.id}>{bp.product.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={addSelectedProduct}
              disabled={!selectedBpId}
              className="h-9 w-9 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Line item cards */}
          {lines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No items added yet</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="rounded-lg border bg-slate-50 p-3">
                  <div className="flex items-start justify-between mb-2.5">
                    <p className="font-medium text-sm">{line.product_name}</p>
                    <button
                      onClick={() => removeLine(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0 mt-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Qty ({line.unit_type})</Label>
                      <Input
                        type="number" min={0} step="any"
                        value={line.quantity || ""}
                        placeholder="0"
                        onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Unit Price</Label>
                      <Input
                        type="number" min={0} step="any"
                        value={line.unit_price || ""}
                        placeholder="0.00"
                        onChange={(e) => updateLine(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Boxes</Label>
                      <Input
                        type="number" min={0} step="any"
                        value={line.boxes || ""}
                        placeholder="0"
                        onChange={(e) => updateLine(idx, "boxes", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Discount</Label>
                      <Input
                        type="number" min={0} step="any"
                        value={line.discount || ""}
                        placeholder="0"
                        onChange={(e) => updateLine(idx, "discount", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <span className="text-sm font-medium tabular-nums">
                      {formatCurrency(Math.max(0, line.unit_price * line.quantity - line.discount), currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer (sticky, slate-50 bg) */}
        <div className="border-t bg-slate-50 px-4 py-3 space-y-2.5 shrink-0">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Sale Discount</span>
            <Input
              type="number" min={0} step="any"
              value={saleDiscount || ""}
              placeholder="0"
              onChange={(e) => setSaleDiscount(parseFloat(e.target.value) || 0)}
              className="h-7 w-28 text-sm text-right"
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold text-sm">Total</span>
            <span className="font-bold text-primary text-base tabular-nums">{formatCurrency(total, currency)}</span>
          </div>

          {/* Payment toggles */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { v: "cash", l: "Cash" },
              { v: "mobile", l: "Mobile Money" },
              { v: "credit", l: "Credit" },
            ].map((m) => (
              <button
                key={m.v}
                onClick={() => setPaymentMethod(m.v)}
                className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
                  paymentMethod === m.v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted border-border"
                }`}
              >
                {m.l}
              </button>
            ))}
          </div>

          {/* Credit: customer selector + add */}
          {paymentMethod === "credit" && (
            <div className="flex gap-2">
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Select customer *" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} label={c.name}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => setAddCustomerOpen(true)}
                className="h-8 w-8 shrink-0 rounded border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Sale date — admins/supervisors only */}
          {canBackdate && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              {saleDate !== TODAY && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] shrink-0 px-1.5">
                  Backdated
                </Badge>
              )}
            </div>
          )}

          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-8 text-xs"
          />

          <button
            onClick={handleSubmit}
            disabled={loading || lines.length === 0}
            className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Record Sale — {formatCurrency(total, currency)}
          </button>
        </div>
      </div>

      <BulkEntryDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        branchProducts={branchProducts}
        customers={customers}
        currency={currency}
        session={session}
        branches={branches}
      />

      {/* ── Right: History ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isSalesperson ? (
          <>
            <div className="px-6 pt-4 pb-3 border-b shrink-0">
              <h2 className="font-semibold text-sm">Today&apos;s Sales</h2>
              {!todayLoading && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {todaySales.length} transaction{todaySales.length !== 1 ? "s" : ""} · {formatCurrency(todaySales.reduce((s, x) => s + x.total_amount, 0), currency)}
                </p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {todayLoading ? (
                <div className="flex justify-center pt-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : todaySales.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm pt-12">No sales recorded today</p>
              ) : (
                todaySales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} currency={currency} deletingId={deletingId} onDelete={() => deleteSale(sale.id)} />
                ))
              )}
            </div>
          </>
        ) : selectedDate ? (
          <>
            {/* Date drill-down header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSelectedDate(null); setExpandedBatches(new Set()) }}
                  className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="font-semibold text-sm">{formatDateLabel(selectedDate)}</h2>
                  {!dateLoading && (
                    <p className="text-xs text-muted-foreground">
                      {dateSales.length} transaction{dateSales.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
              {!dateLoading && dateSales.length > 0 && (
                <span className="font-bold text-sm tabular-nums">
                  Total: {formatCurrency(dateSales.reduce((s, x) => s + x.total_amount, 0), currency)}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {dateLoading ? (
                <div className="flex justify-center pt-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : dateSales.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm pt-12">No sales for this date</p>
              ) : (() => {
                // Split into bulk batches and direct entries
                const batchMap = new Map<string, IndividualSale[]>()
                const directSales: IndividualSale[] = []
                for (const sale of dateSales) {
                  if (sale.batch_id) {
                    if (!batchMap.has(sale.batch_id)) batchMap.set(sale.batch_id, [])
                    batchMap.get(sale.batch_id)!.push(sale)
                  } else {
                    directSales.push(sale)
                  }
                }
                const batches = Array.from(batchMap.entries())

                // One row per SALE — items stacked with <p> tags inside each cell
                function SalesTable({ sales }: { sales: IndividualSale[] }) {
                  return (
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "17%" }} />
                        <col style={{ width: "8%" }} />
                      </colgroup>
                      <thead className="bg-muted/30 border-b">
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Time</th>
                          <th className="px-3 py-2 font-medium">Items</th>
                          <th className="px-3 py-2 font-medium">Qty</th>
                          <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                          <th className="px-3 py-2 font-medium text-right">Amount</th>
                          <th className="px-3 py-2 font-medium">Payment</th>
                          <th className="px-3 py-2 font-medium">Recorded by</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((sale) => {
                          const items = sale.sale_items.length > 0 ? sale.sale_items : []
                          const time = new Date(sale.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                          const recorderName = sale.recorded_by_name ?? sale.recorded_by.slice(0, 8)
                          return (
                            <tr key={sale.id} className="border-b transition-colors hover:bg-muted/20">
                              {/* Time */}
                              <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground whitespace-nowrap align-top pt-3">
                                {time}
                              </td>
                              {/* Items — stacked */}
                              <td className="px-3 py-2.5 text-xs align-top">
                                {items.length === 0
                                  ? <span className="text-muted-foreground italic">—</span>
                                  : <div className="space-y-1">
                                      {items.map((item, i) => (
                                        <p key={i} className="leading-tight">{item.product?.name ?? "—"}</p>
                                      ))}
                                    </div>
                                }
                              </td>
                              {/* Qty — stacked */}
                              <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums align-top">
                                <div className="space-y-1">
                                  {items.map((item, i) => (
                                    <p key={i} className="leading-tight">{getQtyDisplay(item)}</p>
                                  ))}
                                </div>
                              </td>
                              {/* Unit price — stacked */}
                              <td className="px-3 py-2.5 text-xs text-right tabular-nums text-muted-foreground align-top">
                                <div className="space-y-1">
                                  {items.map((item, i) => (
                                    <p key={i} className="leading-tight">
                                      {item.unit_price > 0 ? formatCurrency(item.unit_price, currency) : "—"}
                                    </p>
                                  ))}
                                </div>
                              </td>
                              {/* Amount — sale total, bold */}
                              <td className="px-3 py-2.5 text-xs text-right tabular-nums align-top pt-3">
                                <span className="font-bold">{formatCurrency(sale.total_amount, currency)}</span>
                              </td>
                              {/* Payment */}
                              <td className="px-3 py-2.5 align-top pt-2.5">{paymentBadge(sale.payment_method)}</td>
                              {/* Recorded by */}
                              <td className="px-3 py-2.5 text-xs text-muted-foreground truncate align-top pt-3">{recorderName}</td>
                              {/* Actions */}
                              <td className="px-3 py-2.5 align-top pt-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setEditingSale(sale)}
                                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(sale.id)}
                                    disabled={deletingId === sale.id}
                                    className="h-6 w-6 rounded flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                  >
                                    {deletingId === sale.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                }

                return (
                  <div className="space-y-4 p-4">
                    {/* ── Bulk Entries ── */}
                    {batches.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
                          Bulk Entries ({batches.length})
                        </p>
                        <div className="space-y-2">
                          {batches.map(([batchId, sales]) => {
                            const isOpen = expandedBatches.has(batchId)
                            const batchTotal = sales.reduce((s, x) => s + x.total_amount, 0)
                            const batchTime = new Date(sales[0].created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                            const recorder = sales[0].recorded_by_name ?? sales[0].recorded_by.slice(0, 8)
                            return (
                              <div key={batchId} className="border rounded-lg overflow-hidden">
                                <button
                                  onClick={() => setExpandedBatches((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(batchId)) next.delete(batchId)
                                    else next.add(batchId)
                                    return next
                                  })}
                                  className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                                    <span className="font-semibold text-blue-800 text-sm">
                                      {sales.length} order{sales.length !== 1 ? "s" : ""}
                                    </span>
                                    <span className="text-xs text-blue-500">{batchTime} · {recorder}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-blue-800 text-sm tabular-nums">
                                      {formatCurrency(batchTotal, currency)}
                                    </span>
                                    {isOpen
                                      ? <ChevronDown className="h-4 w-4 text-blue-500" />
                                      : <ChevronRight className="h-4 w-4 text-blue-500" />
                                    }
                                  </div>
                                </button>
                                {isOpen && (
                                  <div className="border-t overflow-x-auto">
                                    <SalesTable sales={sales} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Direct Entries ── */}
                    {directSales.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
                          Direct Entries ({directSales.length})
                        </p>
                        <div className="bg-white rounded-lg border overflow-x-auto">
                          <SalesTable sales={directSales} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between px-6 pt-4 pb-3 border-b shrink-0">
              <h2 className="font-semibold text-sm">All Sales</h2>
              <span className="text-xs text-muted-foreground">Last 90 days · click a row to see transactions</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-center">Sales</th>
                    <th className="px-3 py-2 font-medium text-right">Revenue</th>
                    <th className="px-3 py-2 font-medium text-right">Cash</th>
                    <th className="px-3 py-2 font-medium text-right">Mobile</th>
                    <th className="px-6 py-2 font-medium text-right">Reconciliation</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summaries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted-foreground py-16 text-sm">No sales recorded yet</td>
                    </tr>
                  ) : (
                    summaries.map((s) => (
                      <tr
                        key={s.sale_date}
                        onClick={() => handleDateClick(s.sale_date)}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-3 font-medium whitespace-nowrap">{formatDateLabel(s.sale_date)}</td>
                        <td className="px-3 py-3 text-center text-muted-foreground">{s.count}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums">{formatCurrency(s.total, currency)}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{formatCurrency(s.cash, currency)}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{formatCurrency(s.mobile, currency)}</td>
                        <td className="px-6 py-3 text-right"><ReconCell recon={s.recon} /></td>
                        <td className="pr-3 py-3 text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Delete Confirm dialog ── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Sale?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the sale record and cannot be undone.</p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!!deletingId}
              onClick={() => { if (deleteConfirmId) deleteSale(deleteConfirmId) }}
            >
              {deletingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Sale dialog ── */}
      {editingSale && (
        <EditSaleDialog
          sale={editingSale}
          currency={currency}
          onClose={() => setEditingSale(null)}
          onSave={updateSale}
        />
      )}

      {/* Add Customer dialog */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="+233..." />
            </div>
            <Button onClick={addCustomer} disabled={addingCustomer || !newCustomerName.trim()} className="w-full">
              {addingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
