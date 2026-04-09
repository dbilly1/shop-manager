"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDate } from "@/utils/format"
import { Plus, Loader2, CheckCircle, XCircle, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext } from "@/types"
import { canApproveTransfers } from "@/lib/permissions"

interface Transfer {
  id: string
  quantity: number
  reason: string | null
  status: string
  created_at: string
  product: { name: string; unit_type: string } | null
  from_branch: { name: string } | null
  to_branch: { name: string } | null
}

interface Props {
  transfers: Transfer[]
  branches: { id: string; name: string }[]
  products: { id: string; name: string; unit_type: string }[]
  session: SessionContext
}

const STATUS_BADGE: Record<string, React.ReactNode> = {
  pending: <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>,
  approved: <Badge variant="outline" className="text-green-600 border-green-300">Approved</Badge>,
  rejected: <Badge variant="destructive">Rejected</Badge>,
  cancelled: <Badge variant="secondary">Cancelled</Badge>,
}

export function TransfersClient({ transfers, branches, products, session }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)

  const [fromBranch, setFromBranch] = useState("")
  const [toBranch, setToBranch] = useState("")
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState("")

  const canApprove = session.role ? canApproveTransfers(session.role) : false

  async function handleSubmit() {
    if (!fromBranch || !toBranch || !productId || !quantity) {
      toast.error("Fill all required fields")
      return
    }
    if (fromBranch === toBranch) {
      toast.error("Source and destination must be different")
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from("stock_transfers").insert({
      shop_id: session.shop_id,
      from_branch_id: fromBranch,
      to_branch_id: toBranch,
      product_id: productId,
      quantity: parseFloat(quantity),
      reason: reason || null,
      requested_by: session.user_id,
      status: "pending",
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Transfer request submitted")
      setOpen(false)
      router.refresh()
    }
    setLoading(false)
  }

  async function handleApprove(id: string) {
    setApproving(id)
    const res = await fetch("/api/transfers/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_id: id }),
    })
    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? "Failed")
    } else {
      toast.success("Transfer approved")
      router.refresh()
    }
    setApproving(null)
  }

  async function handleReject(id: string) {
    const supabase = createClient()
    await supabase.from("stock_transfers").update({ status: "rejected" }).eq("id", id)
    toast.success("Transfer rejected")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stock Transfers</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Transfer
        </Button>
      </div>

      <div className="space-y-3">
        {transfers.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No transfers yet</CardContent></Card>
        ) : (
          transfers.map((t) => (
            <Card key={t.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{t.product?.name}</p>
                      <Badge variant="outline" className="text-xs">{t.quantity} {t.product?.unit_type}</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <span>{t.from_branch?.name}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{t.to_branch?.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(t.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {STATUS_BADGE[t.status]}
                    {canApprove && t.status === "pending" && (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" disabled={approving === t.id} onClick={() => handleApprove(t.id)}>
                          {approving === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleReject(t.id)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Stock Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>From Branch</Label>
                <Select value={fromBranch} onValueChange={(v) => setFromBranch(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To Branch</Label>
                <Select value={toBranch} onValueChange={(v) => setToBranch(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={productId} onValueChange={(v) => setProductId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reason <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Transfer Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
