"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { LinkButton } from "@/components/ui/link-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { formatCurrency, formatDate, formatPaymentMethod } from "@/utils/format"
import { ArrowLeft, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext } from "@/types"

interface SaleWithItems {
  id: string
  total_amount: number
  payment_method: string
  created_at: string
  customer: { name: string } | null
  sale_items: Array<{
    id: string
    quantity_kg: number
    quantity_units: number
    quantity_boxes: number
    unit_price: number
    discount_amount: number
    line_total: number
    product: { name: string; unit_type: string } | null
  }>
}

interface Props {
  date: string
  sales: SaleWithItems[]
  currency: string
  session: SessionContext
}

export function SaleDayClient({ date, sales, currency, session }: Props) {
  const router = useRouter()
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canDelete = ["owner", "general_manager", "branch_manager"].includes(session.role ?? "")
  const total = sales.reduce((s, r) => s + r.total_amount, 0)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)

    const supabase = createClient()
    const { error } = await supabase.from("sales").delete().eq("id", deleteTarget)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Sale deleted")
      router.refresh()
    }
    setDeleteTarget(null)
    setDeleting(false)
  }

  function getQty(item: SaleWithItems["sale_items"][number]) {
    if (!item.product) return item.quantity_units
    switch (item.product.unit_type) {
      case "kg": return item.quantity_kg
      case "boxes": return item.quantity_boxes
      default: return item.quantity_units
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <LinkButton href="/sales" variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></LinkButton>
        <div>
          <h1 className="text-xl font-bold">{formatDate(date)}</h1>
          <p className="text-sm text-muted-foreground">{sales.length} transactions · {formatCurrency(total, currency)}</p>
        </div>
      </div>

      {sales.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No sales for this date
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sales.map((sale) => (
            <Card key={sale.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{formatPaymentMethod(sale.payment_method)}</Badge>
                    {sale.customer && <span className="text-sm text-muted-foreground">{sale.customer.name}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatCurrency(sale.total_amount, currency)}</span>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(sale.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {sale.sale_items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm text-muted-foreground">
                      <span>
                        {item.product?.name} × {getQty(item)} {item.product?.unit_type}
                        {item.discount_amount > 0 && (
                          <span className="ml-1 text-xs">(−{formatCurrency(item.discount_amount, currency)})</span>
                        )}
                      </span>
                      <span>{formatCurrency(item.line_total, currency)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sale?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the sale and restore the associated stock. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
