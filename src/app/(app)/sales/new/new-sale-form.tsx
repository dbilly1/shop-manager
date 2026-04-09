"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/utils/format"
import { Plus, Trash2, Loader2, ShoppingCart } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext } from "@/types"
import { canBackdateSales } from "@/lib/permissions"

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
  discount: number
  cost_price: number
}

interface Props {
  branchProducts: BranchProduct[]
  customers: { id: string; name: string; phone: string | null }[]
  currency: string
  pricingMode: string
  session: SessionContext
  branches: { id: string; name: string }[]
}

export function NewSaleForm({ branchProducts, customers, currency, session, branches }: Props) {
  const router = useRouter()
  const [lines, setLines] = useState<SaleLineItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [customerId, setCustomerId] = useState("")
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0])
  const [selectedBranchId, setSelectedBranchId] = useState(session.branch_id ?? "")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const showBackdate = session.role ? canBackdateSales(session.role) : false

  function addLine() {
    if (branchProducts.length === 0) return
    const bp = branchProducts[0]
    if (!bp.product) return
    setLines((prev) => [
      ...prev,
      {
        branch_product_id: bp.id,
        product_id: bp.product!.id,
        product_name: bp.product!.name,
        unit_type: bp.product!.unit_type,
        unit_price: bp.override_price ?? bp.product!.base_price,
        quantity: 1,
        discount: 0,
        cost_price: bp.product!.cost_price,
      },
    ])
  }

  function updateLine(idx: number, field: keyof SaleLineItem, value: string | number) {
    setLines((prev) => {
      const next = [...prev]
      if (field === "branch_product_id") {
        const bp = branchProducts.find((p) => p.id === value)
        if (bp?.product) {
          next[idx] = {
            ...next[idx],
            branch_product_id: bp.id,
            product_id: bp.product.id,
            product_name: bp.product.name,
            unit_type: bp.product.unit_type,
            unit_price: bp.override_price ?? bp.product.base_price,
            cost_price: bp.product.cost_price,
          }
        }
      } else {
        next[idx] = { ...next[idx], [field]: value }
      }
      return next
    })
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const total = lines.reduce((s, l) => s + (l.unit_price * l.quantity - l.discount), 0)

  async function handleSubmit() {
    if (lines.length === 0) {
      setError("Add at least one item")
      return
    }
    if (paymentMethod === "credit" && !customerId) {
      setError("Credit sales require a customer")
      return
    }
    setLoading(true)
    setError("")

    const branchId = session.branch_id ?? selectedBranchId
    if (!branchId) {
      setError("Select a branch")
      setLoading(false)
      return
    }

    const supabase = createClient()

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        shop_id: session.shop_id,
        branch_id: branchId,
        sale_date: saleDate,
        total_amount: total,
        payment_method: paymentMethod,
        customer_id: customerId || null,
        recorded_by: session.user_id,
      })
      .select()
      .single()

    if (saleError || !sale) {
      setError(saleError?.message ?? "Failed to create sale")
      setLoading(false)
      return
    }

    // Insert sale items
    const items = lines.map((l) => ({
      sale_id: sale.id,
      shop_id: session.shop_id,
      branch_id: branchId,
      product_id: l.product_id,
      quantity_kg: l.unit_type === "kg" ? l.quantity : 0,
      quantity_units: l.unit_type === "units" ? l.quantity : 0,
      quantity_boxes: l.unit_type === "boxes" ? l.quantity : 0,
      unit_price: l.unit_price,
      discount_amount: l.discount,
      line_total: l.unit_price * l.quantity - l.discount,
      cost_price_at_sale: l.cost_price,
    }))

    const { error: itemsError } = await supabase.from("sale_items").insert(items)
    if (itemsError) {
      setError(itemsError.message)
      setLoading(false)
      return
    }

    // Decrement stock
    for (const l of lines) {
      const bp = branchProducts.find((p) => p.id === l.branch_product_id)
      if (!bp) continue
      const update: Record<string, number> = {}
      if (l.unit_type === "kg") update.current_stock_kg = Math.max(0, bp.current_stock_kg - l.quantity)
      else if (l.unit_type === "boxes") update.current_stock_boxes = Math.max(0, bp.current_stock_boxes - l.quantity)
      else update.current_stock_units = Math.max(0, bp.current_stock_units - l.quantity)
      await supabase.from("branch_products").update({ ...update, updated_at: new Date().toISOString() }).eq("id", bp.id)
    }

    // Create credit sale record if credit
    if (paymentMethod === "credit" && customerId) {
      await supabase.from("credit_sales").insert({
        shop_id: session.shop_id,
        branch_id: branchId,
        sale_id: sale.id,
        customer_id: customerId,
        amount_owed: total,
        amount_paid: 0,
        balance: total,
      })
    }

    toast.success("Sale recorded successfully")
    router.push("/sales")
    router.refresh()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">New Sale</h1>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Branch selector for consolidated users */}
      {!session.branch_id && branches.length > 0 && (
        <div className="space-y-2">
          <Label>Branch</Label>
          <Select value={selectedBranchId} onValueChange={(v) => setSelectedBranchId(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Line items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                {idx === 0 && <Label className="text-xs text-muted-foreground">Product</Label>}
                <Select
                  value={line.branch_product_id}
                  onValueChange={(v) => updateLine(idx, "branch_product_id", v ?? "")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branchProducts.map((bp) => bp.product && (
                      <SelectItem key={bp.id} value={bp.id}>{bp.product.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                {idx === 0 && <Label className="text-xs text-muted-foreground">Qty</Label>}
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
              <div className="col-span-2">
                {idx === 0 && <Label className="text-xs text-muted-foreground">Price</Label>}
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={line.unit_price}
                  onChange={(e) => updateLine(idx, "unit_price", parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
              <div className="col-span-2">
                {idx === 0 && <Label className="text-xs text-muted-foreground">Disc.</Label>}
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={line.discount}
                  onChange={(e) => updateLine(idx, "discount", parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
              <div className="col-span-1">
                {idx === 0 && <div className="h-4" />}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => removeLine(idx)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addLine} className="mt-2">
            <Plus className="mr-2 h-4 w-4" />
            Add item
          </Button>

          {lines.length > 0 && (
            <>
              <Separator />
              <div className="flex justify-between text-sm font-medium">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {["cash", "mobile", "credit"].map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors capitalize ${
                  paymentMethod === m
                    ? "bg-foreground text-background border-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {m === "mobile" ? "Mobile Money" : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {paymentMethod === "credit" && (
            <div className="space-y-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} label={c.name}>
                      {c.name}{c.phone ? ` · ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {paymentMethod !== "credit" && (
            <div className="space-y-2">
              <Label>Customer <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="No customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showBackdate && (
            <div className="space-y-2">
              <Label>Sale Date</Label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSubmit} disabled={loading || lines.length === 0} className="w-full">
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ShoppingCart className="mr-2 h-4 w-4" />
        )}
        Record Sale · {formatCurrency(total, currency)}
      </Button>
    </div>
  )
}
