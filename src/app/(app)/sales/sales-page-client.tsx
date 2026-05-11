"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  TrendingUp, TrendingDown, Minus, ChevronRight, ArrowLeft,
  Pencil, Trash2, Receipt, ScanLine,
} from "lucide-react"
import { toast } from "sonner"
import type { SessionContext } from "@/types"
import { canBackdateSales } from "@/lib/permissions"
import { logAuditAction } from "@/lib/audit-action"
import { BulkEntryDialog } from "./bulk/bulk-sale-form"
import { ReceiptModal } from "@/components/receipt/receipt-modal"
import { BarcodeScanner } from "@/components/scanner/barcode-scanner"
import { usePagination } from "@/hooks/usePagination"
import { PaginationBar } from "@/components/ui/pagination-bar"
import type { ReceiptSaleData } from "@/components/receipt/receipt-preview"

interface BranchProduct {
  id: string
  branch_id: string
  override_price: number | null
  current_stock_kg: number
  current_stock_units: number
  current_stock_boxes: number
  product: { id: string; name: string; unit_type: string; units_per_box: number | null; base_price: number; cost_price: number } | null
}

interface SaleLineItem {
  branch_product_id: string
  product_id: string
  product_name: string
  unit_type: string
  units_per_box: number | null
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
  tax: number
  recon: { cash_variance: number; mobile_variance: number; status: string } | null
}

interface SaleItem {
  id: string
  branch_id: string
  product_id: string
  quantity_kg: number
  quantity_units: number
  quantity_boxes: number
  unit_price: number
  line_total: number
  product: { name: string; unit_type: string; units_per_box: number | null } | null
}

interface IndividualSale {
  id: string
  sale_date: string
  total_amount: number
  payment_method: string
  customer_id: string | null
  created_at: string
  recorded_by: string
  recorded_by_name: string | null
  notes: string | null
  batch_id: string | null
  taxes_snapshot: { label: string; rate: number; amount: number }[]
  sale_items: SaleItem[]
}

interface FullSalePatch {
  sale_date?: string
  payment_method?: string
  customer_id?: string | null
  total_amount?: number
  notes?: string | null
  items?: Array<{
    id: string
    branch_id: string
    product_id: string
    unit_type: string
    units_per_box: number | null
    quantity_kg: number
    quantity_units: number
    quantity_boxes: number
    unit_price: number
    line_total: number
    orig_quantity_kg: number
    orig_quantity_units: number
    orig_quantity_boxes: number
  }>
}

interface Props {
  summaries: DailySummary[]
  branchProducts: BranchProduct[]
  customers: { id: string; name: string; phone: string | null }[]
  currency: string
  session: SessionContext
  branches: { id: string; name: string }[]
  activeBranchId?: string | null
}

const TODAY = new Date().toISOString().split("T")[0]

function paymentBadge(method: string) {
  if (method === "cash") return <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/15 text-[10px] px-1.5 py-0">Cash</Badge>
  if (method === "mobile") return <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/15 text-[10px] px-1.5 py-0">Mobile</Badge>
  return <Badge className="bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 text-[10px] px-1.5 py-0">Credit</Badge>
}

function getQtyDisplay(item: SaleItem) {
  const ut = item.product?.unit_type ?? "units"
  const parts: string[] = []
  if (ut === "kg" && item.quantity_kg > 0) parts.push(`${item.quantity_kg} kg`)
  else if (item.quantity_units > 0) parts.push(`${item.quantity_units} units`)
  if (item.quantity_boxes > 0) parts.push(`${item.quantity_boxes} box${item.quantity_boxes !== 1 ? "es" : ""}`)
  return parts.length > 0 ? parts.join(" + ") : "—"
}

function saleToReceiptData(sale: IndividualSale): ReceiptSaleData {
  return {
    id: sale.id,
    saleDate: sale.sale_date,
    createdAt: sale.created_at,
    paymentMethod: sale.payment_method,
    totalAmount: sale.total_amount,
    recordedByName: sale.recorded_by_name,
    notes: sale.notes,
    branchId: sale.sale_items[0]?.branch_id ?? "",
    taxesSnapshot: sale.taxes_snapshot ?? [],
    items: sale.sale_items.map((item) => {
      const ut  = item.product?.unit_type ?? "units"
      const qty = ut === "kg" ? item.quantity_kg : item.quantity_units
      return {
        productName: item.product?.name ?? "Unknown",
        unitType: ut,
        quantity: qty,
        unitPrice: item.unit_price,
        discountAmount: 0,
        lineTotal: item.line_total,
      }
    }),
  }
}

function SaleCard({
  sale, currency, deletingId, onDelete, onReceipt,
}: {
  sale: IndividualSale
  currency: string
  deletingId: string | null
  onDelete: () => void
  onReceipt: () => void
}) {
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  }
  return (
    <div
      className="border rounded-lg p-3 space-y-2 bg-background cursor-pointer hover:bg-muted/20 transition-colors"
      onClick={onReceipt}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{formatCurrency(sale.total_amount, currency)}</span>
          {paymentBadge(sale.payment_method)}
        </div>
        {/* Stop propagation so edit/delete don't also open the receipt */}
        <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDelete}
            disabled={deletingId === sale.id}
            className="h-8 w-8 rounded flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            title="Delete sale"
          >
            {deletingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
  sale, currency, customers, canBackdate, onClose, onSave,
}: {
  sale: IndividualSale
  currency: string
  customers: { id: string; name: string; phone: string | null }[]
  canBackdate: boolean
  onClose: () => void
  onSave: (id: string, patch: FullSalePatch) => Promise<void>
}) {
  interface EditItem {
    id: string
    product_name: string
    unit_type: string
    units_per_box: number | null
    quantity: number
    boxes: number
    unit_price: number
  }

  function initItems(): EditItem[] {
    return sale.sale_items.map((item) => {
      const ut = item.product?.unit_type ?? "units"
      const qty = ut === "kg" ? item.quantity_kg : item.quantity_units
      return {
        id: item.id,
        product_name: item.product?.name ?? "Item",
        unit_type: ut,
        units_per_box: item.product?.units_per_box ?? null,
        quantity: qty,
        boxes: item.quantity_boxes,
        unit_price: item.unit_price,
      }
    })
  }

  const [saleDate, setSaleDate] = useState(sale.sale_date)
  const [paymentMethod, setPaymentMethod] = useState(sale.payment_method)
  const [customerId, setCustomerId] = useState(sale.customer_id ?? "")
  const [notes, setNotes] = useState(sale.notes ?? "")
  const [editItems, setEditItems] = useState<EditItem[]>(initItems)
  const [saving, setSaving] = useState(false)

  function updateItem(idx: number, field: "quantity" | "boxes" | "unit_price", value: number) {
    setEditItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function itemLineTotal(item: EditItem): number {
    const boxAmt = item.units_per_box ? item.unit_price * item.units_per_box * item.boxes : 0
    return Math.max(0, item.unit_price * item.quantity + boxAmt)
  }

  const newTotal = editItems.reduce((s, i) => s + itemLineTotal(i), 0)

  async function handleSave() {
    if (paymentMethod === "credit" && !customerId) {
      toast.error("Select a customer for credit sales")
      return
    }
    setSaving(true)
    await onSave(sale.id, {
      sale_date: saleDate,
      payment_method: paymentMethod,
      customer_id: paymentMethod === "credit" ? customerId || null : null,
      total_amount: newTotal,
      notes: notes.trim() || null,
      items: editItems.map((item) => {
        const orig = sale.sale_items.find((s) => s.id === item.id)
        return {
          id: item.id,
          branch_id: orig?.branch_id ?? "",
          product_id: orig?.product_id ?? "",
          unit_type: item.unit_type,
          units_per_box: item.units_per_box,
          quantity_kg: item.unit_type === "kg" ? item.quantity : 0,
          quantity_units: item.unit_type === "units" ? item.quantity : 0,
          quantity_boxes: item.boxes,
          unit_price: item.unit_price,
          line_total: itemLineTotal(item),
          orig_quantity_kg: orig?.quantity_kg ?? 0,
          orig_quantity_units: orig?.quantity_units ?? 0,
          orig_quantity_boxes: orig?.quantity_boxes ?? 0,
        }
      }),
    })
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Sale</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">

          {/* Date */}
          {canBackdate && (
            <div className="space-y-1.5">
              <Label>Sale Date</Label>
              <Input type="date" value={saleDate} max={TODAY} onChange={(e) => setSaleDate(e.target.value)} className="h-9" />
            </div>
          )}

          {/* Items */}
          {editItems.length > 0 && (
            <div className="space-y-2">
              <Label>Items</Label>
              {editItems.map((item, idx) => (
                <div key={item.id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                  <p className="text-sm font-medium">{item.product_name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Qty ({item.unit_type})</Label>
                      <Input
                        type="number" min={0} step="any"
                        value={item.quantity || ""}
                        placeholder="0"
                        onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Unit Price</Label>
                      <Input
                        type="number" min={0} step="any"
                        value={item.unit_price || ""}
                        placeholder="0.00"
                        onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    {item.units_per_box ? (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Boxes</Label>
                        <Input
                          type="number" min={0} step="any"
                          value={item.boxes || ""}
                          placeholder="0"
                          onChange={(e) => updateItem(idx, "boxes", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : <div />}
                  </div>
                  <div className="flex justify-end">
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {formatCurrency(itemLineTotal(item), currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

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

          {/* Customer — only for credit */}
          {paymentMethod === "credit" && (
            <div className="space-y-1.5">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" />
          </div>

          {/* Total preview */}
          <div className="bg-muted/40 rounded-lg px-3 py-2.5 flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold tabular-nums">{formatCurrency(newTotal, currency)}</span>
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

export function SalesPageClient({ summaries, branchProducts, customers: initialCustomers, currency, session, branches, activeBranchId }: Props) {
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
  const [selectedBranchId, setSelectedBranchId] = useState(
    session.branch_id ?? activeBranchId ?? "",
  )
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  // Mobile panel toggle: "form" = New Sale, "history" = All Sales
  const [mobilePanel, setMobilePanel] = useState<"form" | "history">("form")
  const [customers, setCustomers] = useState(initialCustomers)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [addingCustomer, setAddingCustomer] = useState(false)

  // Shop tax rates — loaded once; applied at checkout and snapshotted on each sale
  const [shopTaxRates, setShopTaxRates] = useState<{ label: string; rate: number }[]>([])
  const taxRatesFetchedRef = useRef(false)

  // Summary table pagination
  const {
    paginatedData: pagedSummaries,
    page: summaryPage,
    setPage: setSummaryPage,
    pageSize: summaryPageSize,
    setPageSize: setSummaryPageSize,
    totalPages: summaryTotalPages,
    totalItems: summaryTotalItems,
    startIndex: summaryStart,
    endIndex: summaryEnd,
  } = usePagination(summaries)

  // Right panel
  const [todaySales, setTodaySales] = useState<IndividualSale[]>([])
  const [todayLoading, setTodayLoading] = useState(isSalesperson)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dateSales, setDateSales] = useState<IndividualSale[]>([])
  const [dateLoading, setDateLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<IndividualSale | null>(null)
  const [editingSale, setEditingSale] = useState<IndividualSale | null>(null)
  const [receiptSale, setReceiptSale] = useState<ReceiptSaleData | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)

  const fetchSalesForDate = useCallback(async (date: string): Promise<IndividualSale[]> => {
    const supabase = createClient()
    const branchId = session.branch_id ?? selectedBranchId
    let q = supabase
      .from("sales")
      .select("id, sale_date, total_amount, payment_method, customer_id, created_at, recorded_by, recorded_by_name, notes, batch_id, taxes_snapshot, sale_items(id, branch_id, product_id, quantity_kg, quantity_units, quantity_boxes, unit_price, line_total, product:products(name, unit_type, units_per_box)))")
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

  // Legitimate fetch-on-mount: load today's sales for the salesperson view.
  // The setState calls inside loadTodaySales are intentional (loading state + data).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTodaySales() }, [loadTodaySales])

  // Fetch shop tax rates once on mount
  useEffect(() => {
    if (taxRatesFetchedRef.current || !session.shop_id) return
    taxRatesFetchedRef.current = true
    const supabase = createClient()
    supabase
      .from("shops")
      .select("tax_rates")
      .eq("id", session.shop_id)
      .single()
      .then(({ data }) => {
        if (data && Array.isArray(data.tax_rates)) setShopTaxRates(data.tax_rates)
      })
  }, [session.shop_id])

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
      units_per_box: bp.product!.units_per_box ?? null,
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

  const subtotal = lines.reduce((s, l) => {
    const boxAmt = l.units_per_box ? l.unit_price * l.units_per_box * l.boxes : 0
    return s + Math.max(0, l.unit_price * l.quantity + boxAmt - l.discount)
  }, 0)
  const preTaxTotal = Math.max(0, subtotal - saleDiscount)
  const taxLines = shopTaxRates
    .filter((t) => t.rate > 0)
    .map((t) => ({ label: t.label, rate: t.rate, amount: preTaxTotal * t.rate / 100 }))
  const taxesTotal = taxLines.reduce((s, t) => s + t.amount, 0)
  const total = preTaxTotal + taxesTotal

  async function handleSubmit() {
    if (lines.length === 0) { setError("Add at least one item"); return }
    if (paymentMethod === "credit" && !customerId) { setError("Credit sales require a customer"); return }
    const branchId = session.branch_id ?? selectedBranchId
    if (!branchId) { setError("Select a branch"); return }

    setLoading(true)
    setError("")
    const supabase = createClient()

    // Build items for the atomic RPC — boxes convert to primary units server-side
    const rpcItems = lines.map((l) => {
      const boxAmt = l.units_per_box ? l.unit_price * l.units_per_box * l.boxes : 0
      return {
        branch_product_id: l.branch_product_id,
        product_id: l.product_id,
        quantity_kg: l.unit_type === "kg" ? l.quantity : 0,
        quantity_units: l.unit_type === "units" ? l.quantity : 0,
        quantity_boxes: l.boxes,
        unit_price: l.unit_price,
        discount_amount: l.discount,
        line_total: Math.max(0, l.unit_price * l.quantity + boxAmt - l.discount),
        cost_price_at_sale: l.cost_price,
      }
    })

    const { data: saleId, error: rpcError } = await supabase.rpc("create_sale_with_items", {
      p_shop_id: session.shop_id,
      p_branch_id: branchId,
      p_sale_date: saleDate,
      p_total_amount: total,
      p_payment_method: paymentMethod,
      p_customer_id: customerId || null,
      p_recorded_by: session.user_id,
      p_recorded_by_name: session.full_name ?? null,
      p_notes: notes || null,
      p_items: rpcItems,
    })

    if (rpcError || !saleId) { setError(rpcError?.message ?? "Failed to record sale"); setLoading(false); return }

    // Persist the tax snapshot on the sale record for historical accuracy
    if (taxLines.length > 0) {
      await supabase.from("sales").update({ taxes_snapshot: taxLines }).eq("id", String(saleId))
    }

    void logAuditAction({ branchId, action: "CREATE_SALE", entityType: "sale", entityId: String(saleId), newValues: { total_amount: total, payment_method: paymentMethod, sale_date: saleDate, items_count: lines.length } })
    toast.success("Sale recorded")
    setLines([])
    setSaleDiscount(0)
    setNotes("")
    setCustomerId("")
    setPaymentMethod("cash")
    setSaleDate(TODAY)
    setLoading(false)
    if (isSalesperson) loadTodaySales()
    // On mobile, jump to "All Sales" so the user can see the sale they just recorded
    setMobilePanel("history")
    router.refresh()
  }

  async function handleScan(code: string) {
    const supabase = createClient()
    // Find product by SKU
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("shop_id", session.shop_id!)
      .eq("sku", code)
      .single()
    if (!product) { toast.error(`No product found for barcode: ${code}`); return }
    // Find the branch_product
    const bp = branchProducts.find((b) => b.product?.id === product.id)
    if (!bp) { toast.error("Product not available in this branch"); return }
    setSelectedBpId(bp.id)
    // Auto-add to cart
    const existing = lines.findIndex((l) => l.branch_product_id === bp.id)
    if (existing >= 0) {
      setLines((prev) => prev.map((l, i) => i === existing ? { ...l, quantity: l.quantity + 1 } : l))
    } else {
      setLines((prev) => [...prev, {
        branch_product_id: bp.id,
        product_id: bp.product!.id,
        product_name: bp.product!.name,
        unit_type: bp.product!.unit_type,
        units_per_box: bp.product!.units_per_box ?? null,
        unit_price: bp.override_price ?? bp.product!.base_price,
        quantity: 1,
        boxes: 0,
        discount: 0,
        cost_price: bp.product!.cost_price,
      }])
    }
    toast.success(`Added: ${bp.product!.name}`)
  }

  async function addCustomer() {
    if (!newCustomerName.trim()) return
    if (!newCustomerPhone.trim()) { toast.error("Phone number is required"); return }
    setAddingCustomer(true)
    const supabase = createClient()
    const branchId = session.branch_id ?? selectedBranchId
    if (!branchId) { toast.error("Select a branch first"); setAddingCustomer(false); return }
    const { data, error } = await supabase.from("customers").insert({ shop_id: session.shop_id, branch_id: branchId, name: newCustomerName.trim(), phone: newCustomerPhone.trim() }).select().single()
    if (error) { toast.error(error.message); setAddingCustomer(false); return }
    setCustomers((prev) => [...prev, data])
    setCustomerId(data.id)
    setAddCustomerOpen(false)
    setNewCustomerName("")
    setNewCustomerPhone("")
    setAddingCustomer(false)
  }

  async function deleteSale(sale: IndividualSale) {
    setDeletingId(sale.id)
    setDeleteTarget(null)
    const supabase = createClient()

    // Restore stock for each item before deleting
    for (const item of sale.sale_items) {
      const ut = item.product?.unit_type ?? "units"
      const upb = item.product?.units_per_box ?? null
      const boxPrimary = (item.quantity_boxes > 0 && upb) ? item.quantity_boxes * upb : 0
      const { data: bp } = await supabase
        .from("branch_products")
        .select("current_stock_kg, current_stock_units")
        .eq("branch_id", item.branch_id)
        .eq("product_id", item.product_id)
        .single()
      if (!bp) continue
      const update: Record<string, number> = {}
      if (ut === "kg") update.current_stock_kg = bp.current_stock_kg + item.quantity_kg + boxPrimary
      else update.current_stock_units = bp.current_stock_units + item.quantity_units + boxPrimary
      await supabase.from("branch_products")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("branch_id", item.branch_id)
        .eq("product_id", item.product_id)
    }

    const { error } = await supabase.from("sales").delete().eq("id", sale.id)
    if (error) { toast.error(error.message); setDeletingId(null); return }

    void logAuditAction({
      branchId: sale.sale_items[0]?.branch_id ?? session.branch_id ?? "",
      action: "DELETE_SALE",
      entityType: "sale",
      entityId: sale.id,
      oldValues: {
        total_amount: sale.total_amount,
        payment_method: sale.payment_method,
        sale_date: sale.sale_date,
        items_count: sale.sale_items.length,
      },
    })

    toast.success("Sale deleted")
    if (isSalesperson) setTodaySales((prev) => prev.filter((s) => s.id !== sale.id))
    else if (selectedDate) setDateSales((prev) => prev.filter((s) => s.id !== sale.id))
    router.refresh()
    setDeletingId(null)
  }

  async function updateSale(id: string, patch: FullSalePatch) {
    const supabase = createClient()

    // Snapshot original sale for audit before any writes
    const allSales = isSalesperson ? todaySales : dateSales
    const originalSale = allSales.find((s) => s.id === id)

    // Build sales-table update (omit `items`)
    const { items, ...salePatch } = patch
    if (Object.keys(salePatch).length > 0) {
      const { error } = await supabase.from("sales").update(salePatch).eq("id", id)
      if (error) { toast.error(error.message); return }
    }

    // Update each sale_item and apply stock delta
    if (items && items.length > 0) {
      for (const item of items) {
        const { error: ie } = await supabase
          .from("sale_items")
          .update({
            quantity_kg: item.quantity_kg,
            quantity_units: item.quantity_units,
            quantity_boxes: item.quantity_boxes,
            unit_price: item.unit_price,
            line_total: item.line_total,
          })
          .eq("id", item.id)
        if (ie) { toast.error(ie.message); return }

        // Compute net primary-unit delta (old sold − new sold); positive = stock goes up
        const upb = item.units_per_box
        const oldBoxPrimary = (item.orig_quantity_boxes > 0 && upb) ? item.orig_quantity_boxes * upb : 0
        const newBoxPrimary = (item.quantity_boxes > 0 && upb) ? item.quantity_boxes * upb : 0
        const oldPrimary = item.unit_type === "kg" ? item.orig_quantity_kg : item.orig_quantity_units
        const newPrimary = item.unit_type === "kg" ? item.quantity_kg : item.quantity_units
        const delta = (oldPrimary + oldBoxPrimary) - (newPrimary + newBoxPrimary)

        if (delta !== 0) {
          const { data: bp } = await supabase
            .from("branch_products")
            .select("current_stock_kg, current_stock_units")
            .eq("branch_id", item.branch_id)
            .eq("product_id", item.product_id)
            .single()
          if (bp) {
            const stockUpdate: Record<string, number> = {}
            if (item.unit_type === "kg")
              stockUpdate.current_stock_kg = Math.max(0, bp.current_stock_kg + delta)
            else
              stockUpdate.current_stock_units = Math.max(0, bp.current_stock_units + delta)
            await supabase.from("branch_products")
              .update({ ...stockUpdate, updated_at: new Date().toISOString() })
              .eq("branch_id", item.branch_id)
              .eq("product_id", item.product_id)
          }
        }
      }
    }

    void logAuditAction({
      branchId: patch.items?.[0]?.branch_id ?? session.branch_id ?? "",
      action: "UPDATE_SALE",
      entityType: "sale",
      entityId: id,
      oldValues: originalSale ? {
        sale_date:      originalSale.sale_date,
        payment_method: originalSale.payment_method,
        total_amount:   originalSale.total_amount,
        notes:          originalSale.notes,
        items: originalSale.sale_items.map((si) => ({
          id:             si.id,
          product_name:   si.product?.name,
          quantity_kg:    si.quantity_kg,
          quantity_units: si.quantity_units,
          quantity_boxes: si.quantity_boxes,
          unit_price:     si.unit_price,
          line_total:     si.line_total,
        })),
      } : undefined,
      newValues: {
        ...(patch.sale_date      !== undefined && { sale_date:       patch.sale_date }),
        ...(patch.payment_method !== undefined && { payment_method:  patch.payment_method }),
        ...(patch.total_amount   !== undefined && { total_amount:    patch.total_amount }),
        ...(patch.notes          !== undefined && { notes:           patch.notes }),
        ...(items && { items: items.map((i) => ({
          id:             i.id,
          quantity_kg:    i.quantity_kg,
          quantity_units: i.quantity_units,
          quantity_boxes: i.quantity_boxes,
          unit_price:     i.unit_price,
          line_total:     i.line_total,
        })) }),
      },
    })

    // Apply patch to local state
    const applyPatch = (s: IndividualSale): IndividualSale => {
      if (s.id !== id) return s
      const updated: IndividualSale = { ...s, ...salePatch }
      if (items) {
        updated.sale_items = s.sale_items.map((si) => {
          const ni = items.find((i) => i.id === si.id)
          return ni ? { ...si, quantity_kg: ni.quantity_kg, quantity_units: ni.quantity_units, quantity_boxes: ni.quantity_boxes, unit_price: ni.unit_price, line_total: ni.line_total } : si
        })
      }
      return updated
    }

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
    if (!recon) return <div className="flex items-center justify-end gap-1 text-muted-foreground text-xs whitespace-nowrap">Not reconciled</div>
    const variance = recon.cash_variance + recon.mobile_variance
    if (variance === 0) return <div className="flex items-center justify-end gap-1 text-muted-foreground text-xs whitespace-nowrap"><Minus className="h-3 w-3 shrink-0" />Balanced</div>
    if (variance > 0) return <div className="flex items-center justify-end gap-1 text-blue-600 text-xs whitespace-nowrap"><TrendingUp className="h-3 w-3 shrink-0" />+{formatCurrency(variance, currency)}</div>
    return <div className="flex items-center justify-end gap-1 text-destructive text-xs whitespace-nowrap"><TrendingDown className="h-3 w-3 shrink-0" />{formatCurrency(variance, currency)}</div>
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)] overflow-hidden -m-4 md:-m-6">

      {/* ── Mobile tab bar (hidden on desktop) ── */}
      <div className="md:hidden flex shrink-0 border-b bg-background">
        <button
          onClick={() => setMobilePanel("form")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobilePanel === "form" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
        >
          New Sale
        </button>
        <button
          onClick={() => setMobilePanel("history")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobilePanel === "history" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
        >
          All Sales
        </button>
      </div>

      {/* ── Left: Sale Entry ── */}
      <div className={`border-r flex-col bg-background md:flex md:w-[420px] md:shrink-0 md:flex-none md:overflow-hidden ${mobilePanel === "form" ? "flex flex-1 overflow-hidden" : "hidden"}`}>

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
              onClick={() => setScannerOpen(true)}
              title="Scan barcode"
              className="h-9 w-9 shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ScanLine className="h-4 w-4" />
            </button>
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
                <div key={idx} className="rounded-lg border bg-muted/40 p-3">
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
                    {line.units_per_box ? (
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
                    ) : <div />}
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
                      {formatCurrency(Math.max(0, line.unit_price * line.quantity + (line.units_per_box ? line.unit_price * line.units_per_box * line.boxes : 0) - line.discount), currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer (sticky, slate-50 bg) */}
        <div className="border-t bg-muted/40 px-4 py-3 space-y-2.5 shrink-0">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Sale Discount</span>
            <Input
              type="number" min={0} step="any"
              value={saleDiscount || ""}
              placeholder="0"
              onChange={(e) => setSaleDiscount(parseFloat(e.target.value) || 0)}
              className="h-7 w-28 text-sm text-right"
            />
          </div>
          {taxLines.length > 0 && (
            <>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Pre-tax</span>
                <span className="tabular-nums">{formatCurrency(preTaxTotal, currency)}</span>
              </div>
              {taxLines.map((t, i) => (
                <div key={i} className="flex justify-between text-sm text-muted-foreground">
                  <span>{t.label} ({t.rate}%)</span>
                  <span className="tabular-nums">{formatCurrency(t.amount, currency)}</span>
                </div>
              ))}
            </>
          )}
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
                <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 text-[10px] shrink-0 px-1.5">
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
      <div className={`flex-col overflow-hidden md:flex md:flex-1 ${mobilePanel === "history" ? "flex flex-1" : "hidden"}`}>
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
                  <SaleCard key={sale.id} sale={sale} currency={currency} deletingId={deletingId} onDelete={() => deleteSale(sale)} onReceipt={() => setReceiptSale(saleToReceiptData(sale))} />
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
                  onClick={() => setSelectedDate(null)}
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
                  const hasTaxes = sales.some(s => (s.taxes_snapshot ?? []).some(t => t.amount > 0))
                  return (
                    <table className={`w-full ${hasTaxes ? "min-w-[840px]" : "min-w-[740px]"} text-sm table-fixed`}>
                      <colgroup>
                        {hasTaxes ? (
                          <>
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "19%" }} />
                            <col style={{ width: "9%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "11%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "15%" }} />
                            <col style={{ width: "8%" }} />
                          </>
                        ) : (
                          <>
                            <col style={{ width: "9%" }} />
                            <col style={{ width: "22%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "11%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "11%" }} />
                            <col style={{ width: "17%" }} />
                            <col style={{ width: "8%" }} />
                          </>
                        )}
                      </colgroup>
                      <thead className="bg-muted/30 border-b">
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Time</th>
                          <th className="px-3 py-2 font-medium">Items</th>
                          <th className="px-3 py-2 font-medium">Qty</th>
                          <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                          <th className="px-3 py-2 font-medium text-right">Amount</th>
                          {hasTaxes && <th className="px-3 py-2 font-medium text-right">Tax</th>}
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
                            <tr
                              key={sale.id}
                              className="border-b transition-colors hover:bg-muted/20 cursor-pointer"
                              onClick={() => setReceiptSale(saleToReceiptData(sale))}
                            >
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
                              {/* Tax — only rendered when hasTaxes */}
                              {hasTaxes && (() => {
                                const taxTotal = (sale.taxes_snapshot ?? []).reduce((s, t) => s + t.amount, 0)
                                return (
                                  <td className="px-3 py-2.5 text-xs text-right tabular-nums align-top pt-3">
                                    {taxTotal > 0
                                      ? <span className="text-muted-foreground">{formatCurrency(taxTotal, currency)}</span>
                                      : <span className="text-muted-foreground/30">—</span>}
                                  </td>
                                )
                              })()}
                              {/* Payment */}
                              <td className="px-3 py-2.5 align-top pt-2.5">{paymentBadge(sale.payment_method)}</td>
                              {/* Recorded by */}
                              <td className="px-3 py-2.5 text-xs text-muted-foreground truncate align-top pt-3">{recorderName}</td>
                              {/* Actions — stop propagation so row click (receipt) doesn't fire */}
                              <td className="px-3 py-2.5 align-top pt-2" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setEditingSale(sale)}
                                    className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title="Edit sale"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget(sale)}
                                    disabled={deletingId === sale.id}
                                    className="h-7 w-7 rounded flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                    title="Delete sale"
                                  >
                                    {deletingId === sale.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
                    {/* ── Bulk Entries — each batch shows a header then individual rows ── */}
                    {batches.map(([batchId, batchSales]) => {
                      const batchTotal = batchSales.reduce((s, x) => s + x.total_amount, 0)
                      const batchTime = new Date(batchSales[0].created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                      const recorder = batchSales[0].recorded_by_name ?? batchSales[0].recorded_by.slice(0, 8)
                      return (
                        <div key={batchId} className="rounded-lg border overflow-hidden">
                          {/* Batch header — always visible, no toggle */}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-primary/10 border-b">
                            <div className="flex items-center gap-2">
                              <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="text-xs font-semibold text-primary">
                                Bulk Entry · {batchSales.length} order{batchSales.length !== 1 ? "s" : ""}
                              </span>
                              <span className="text-[11px] text-primary/70">{batchTime} · {recorder}</span>
                            </div>
                            <span className="text-xs font-bold text-primary tabular-nums">
                              {formatCurrency(batchTotal, currency)}
                            </span>
                          </div>
                          {/* Individual sale rows — same table structure as direct entries */}
                          <div className="overflow-x-auto">
                            <SalesTable sales={batchSales} />
                          </div>
                        </div>
                      )
                    })}

                    {/* ── Direct Entries ── */}
                    {directSales.length > 0 && (
                      <div className="rounded-lg border overflow-hidden">
                        <div className="px-4 py-2.5 bg-muted/40 border-b">
                          <span className="text-xs font-semibold text-muted-foreground">
                            Direct {directSales.length === 1 ? "Entry" : `Entries · ${directSales.length} orders`}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
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
              <span className="text-xs text-muted-foreground">All sales · click a row to see transactions</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const showTax = summaries.some(s => s.tax > 0)
                const colSpanTotal = showTax ? 8 : 7
                return (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-center">Sales</th>
                    <th className="px-3 py-2 font-medium text-right">Revenue</th>
                    <th className="px-3 py-2 font-medium text-right">Cash</th>
                    <th className="px-3 py-2 font-medium text-right">Mobile</th>
                    {showTax && <th className="px-3 py-2 font-medium text-right">Tax</th>}
                    <th className="px-4 py-2 font-medium text-right">Reconciliation</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summaries.length === 0 ? (
                    <tr>
                      <td colSpan={colSpanTotal} className="text-center text-muted-foreground py-16 text-sm">No sales recorded yet</td>
                    </tr>
                  ) : (
                    pagedSummaries.map((s) => (
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
                        {showTax && (
                          <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                            {s.tax > 0 ? formatCurrency(s.tax, currency) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-3"><ReconCell recon={s.recon} /></td>
                        <td className="pr-3 py-3 text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
                )
              })()}
            </div>
            <PaginationBar
              page={summaryPage}
              totalPages={summaryTotalPages}
              totalItems={summaryTotalItems}
              pageSize={summaryPageSize}
              startIndex={summaryStart}
              endIndex={summaryEnd}
              onPageChange={setSummaryPage}
              onPageSizeChange={setSummaryPageSize}
              label="day"
            />
          </>
        )}
      </div>

      {/* ── Delete Confirm dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Sale?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the sale record and cannot be undone.</p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!!deletingId}
              onClick={() => { if (deleteTarget) deleteSale(deleteTarget) }}
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
          customers={customers}
          canBackdate={canBackdate}
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
              <Label>Phone <span className="text-destructive">*</span></Label>
              <Input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="+233..." />
            </div>
            <Button onClick={addCustomer} disabled={addingCustomer || !newCustomerName.trim() || !newCustomerPhone.trim()} className="w-full">
              {addingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Receipt modal (preview-only — edit defaults in Settings → Receipt) ── */}
      {receiptSale && (
        <ReceiptModal
          open={!!receiptSale}
          onClose={() => setReceiptSale(null)}
          sale={receiptSale}
          session={session}
          currency={currency}
          previewOnly
        />
      )}

      {/* ── Barcode scanner ── */}
      <BarcodeScanner
        open={scannerOpen}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
        title="Scan Product Barcode"
      />
    </div>
  )
}
