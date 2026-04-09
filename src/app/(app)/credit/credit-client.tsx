"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/utils/format"
import { toast } from "sonner"
import {
  User,
  Phone,
  Wallet,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  CreditCard,
} from "lucide-react"
import type { SessionContext } from "@/types"

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreditSaleRow {
  id: string
  shop_id: string
  branch_id: string
  sale_id: string
  customer_id: string
  amount_owed: number
  amount_paid: number
  balance: number
  created_at: string
  customer: { id: string; name: string; phone: string | null } | null
  sale: { sale_date: string } | null
}

interface CreditPayment {
  id: string
  customer_id: string
  amount: number
  payment_method: string
  payment_date: string
  notes: string | null
  recorded_by: string | null
}

interface Props {
  creditSales: CreditSaleRow[]
  currency: string
  overdueThreshold: number
  session: SessionContext
}

// ─── Grouped customer shape ───────────────────────────────────────────────────

interface CustomerGroup {
  customerId: string
  name: string
  phone: string | null
  totalOwed: number
  totalPaid: number
  outstanding: number
  sales: CreditSaleRow[]
  /** branch_id from the first credit sale — used when session.branch_id is null */
  branchId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split("T")[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CreditClient({
  creditSales,
  currency,
  overdueThreshold,
  session,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // ── Selection state ──────────────────────────────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  )

  // ── Payment dialog ───────────────────────────────────────────────────────
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState("")
  const [payMethod, setPayMethod] = useState<"cash" | "mobile_money">("cash")
  const [payDate, setPayDate] = useState(todayIso())
  const [payNotes, setPayNotes] = useState("")
  const [payLoading, setPayLoading] = useState(false)

  // ── Add customer dialog ──────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [addPhone, setAddPhone] = useState("")
  const [addLoading, setAddLoading] = useState(false)

  // ── Edit customer dialog ─────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editLoading, setEditLoading] = useState(false)

  // ── Delete dialog ────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ── Payment history ──────────────────────────────────────────────────────
  const [payments, setPayments] = useState<CreditPayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  // ─── Group credit sales by customer ─────────────────────────────────────
  const customerGroups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>()

    for (const row of creditSales) {
      const cid = row.customer_id
      if (!map.has(cid)) {
        map.set(cid, {
          customerId: cid,
          name: row.customer?.name ?? "Unknown",
          phone: row.customer?.phone ?? null,
          totalOwed: 0,
          totalPaid: 0,
          outstanding: 0,
          sales: [],
          branchId: row.branch_id,
        })
      }
      const g = map.get(cid)!
      g.totalOwed += row.amount_owed
      g.totalPaid += row.amount_paid
      g.outstanding += row.balance
      g.sales.push(row)
    }

    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding)
  }, [creditSales])

  const selectedGroup = useMemo(
    () => customerGroups.find((g) => g.customerId === selectedCustomerId) ?? null,
    [customerGroups, selectedCustomerId],
  )

  // ─── Load payment history whenever selection changes ─────────────────────
  const loadPayments = useCallback(
    async (customerId: string) => {
      setPaymentsLoading(true)
      const { data, error } = await supabase
        .from("credit_payments")
        .select("*")
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false })

      if (error) {
        toast.error("Failed to load payment history")
      } else {
        setPayments((data as CreditPayment[]) ?? [])
      }
      setPaymentsLoading(false)
    },
    [supabase],
  )

  useEffect(() => {
    if (selectedCustomerId) {
      loadPayments(selectedCustomerId)
    } else {
      setPayments([])
    }
  }, [selectedCustomerId, loadPayments])

  // ─── Record payment ───────────────────────────────────────────────────────
  async function handleRecordPayment() {
    if (!selectedGroup) return
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount")
      return
    }

    setPayLoading(true)
    const branchId = session.branch_id ?? selectedGroup.branchId

    const { error } = await supabase.from("credit_payments").insert({
      shop_id: session.shop_id,
      branch_id: branchId,
      customer_id: selectedGroup.customerId,
      amount,
      payment_method: payMethod,
      payment_date: payDate,
      notes: payNotes || null,
      recorded_by: session.user_id,
    })

    if (error) {
      toast.error(error.message)
      setPayLoading(false)
      return
    }

    // Reduce balances oldest-first
    let remaining = amount
    const sortedSales = [...selectedGroup.sales].sort(
      (a, b) =>
        new Date(a.sale?.sale_date ?? a.created_at).getTime() -
        new Date(b.sale?.sale_date ?? b.created_at).getTime(),
    )

    for (const sale of sortedSales) {
      if (remaining <= 0) break
      if (sale.balance <= 0) continue
      const deduct = Math.min(remaining, sale.balance)
      const newPaid = sale.amount_paid + deduct
      const newBalance = sale.balance - deduct
      await supabase
        .from("credit_sales")
        .update({ amount_paid: newPaid, balance: newBalance })
        .eq("id", sale.id)
      remaining -= deduct
    }

    toast.success("Payment recorded")
    setPayOpen(false)
    setPayAmount("")
    setPayNotes("")
    setPayDate(todayIso())
    setPayLoading(false)
    router.refresh()
  }

  // ─── Add customer ─────────────────────────────────────────────────────────
  async function handleAddCustomer() {
    if (!addName.trim()) {
      toast.error("Name is required")
      return
    }

    setAddLoading(true)
    const branchId = session.branch_id

    const { error } = await supabase.from("customers").insert({
      shop_id: session.shop_id,
      ...(branchId ? { branch_id: branchId } : {}),
      name: addName.trim(),
      phone: addPhone.trim() || null,
    })

    if (error) {
      toast.error(error.message)
      setAddLoading(false)
      return
    }

    toast.success("Customer added")
    setAddOpen(false)
    setAddName("")
    setAddPhone("")
    setAddLoading(false)
    router.refresh()
  }

  // ─── Edit customer ────────────────────────────────────────────────────────
  function openEditDialog() {
    if (!selectedGroup) return
    setEditName(selectedGroup.name)
    setEditPhone(selectedGroup.phone ?? "")
    setEditOpen(true)
  }

  async function handleEditCustomer() {
    if (!selectedGroup) return
    if (!editName.trim()) {
      toast.error("Name is required")
      return
    }

    setEditLoading(true)

    const { error } = await supabase
      .from("customers")
      .update({
        name: editName.trim(),
        phone: editPhone.trim() || null,
      })
      .eq("id", selectedGroup.customerId)

    if (error) {
      toast.error(error.message)
      setEditLoading(false)
      return
    }

    toast.success("Customer updated")
    setEditOpen(false)
    setEditLoading(false)
    router.refresh()
  }

  // ─── Delete customer ──────────────────────────────────────────────────────
  async function handleDeleteCustomer() {
    if (!selectedGroup) return

    if (selectedGroup.sales.length > 0) {
      toast.error("Cannot delete customer with credit history")
      setDeleteOpen(false)
      return
    }

    setDeleteLoading(true)

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", selectedGroup.customerId)

    if (error) {
      toast.error(error.message)
      setDeleteLoading(false)
      return
    }

    toast.success("Customer deleted")
    setDeleteOpen(false)
    setSelectedCustomerId(null)
    setDeleteLoading(false)
    router.refresh()
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden -m-4 md:-m-6">
      {/* ── Left panel ── */}
      <div className="w-72 shrink-0 border-r flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">Customers</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setAddName("")
              setAddPhone("")
              setAddOpen(true)
            }}
            aria-label="New customer"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {customerGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-xs text-center px-4">
              <CreditCard className="size-8 mb-2 opacity-40" />
              No outstanding credit
            </div>
          ) : (
            customerGroups.map((group) => {
              const isActive = group.customerId === selectedCustomerId
              return (
                <button
                  key={group.customerId}
                  onClick={() => setSelectedCustomerId(group.customerId)}
                  className={`border rounded-lg p-3 w-full text-left transition-colors ${
                    isActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm leading-tight line-clamp-1">
                      {group.name}
                    </span>
                    {group.outstanding > 0 ? (
                      <Badge variant="destructive" className="shrink-0">
                        {formatCurrency(group.outstanding, currency)}
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 bg-green-100 text-green-700 border-green-200">
                        Settled
                      </Badge>
                    )}
                  </div>
                  {group.phone && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Phone className="size-3 shrink-0" />
                      <span>{group.phone}</span>
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedGroup ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <User className="size-12 opacity-30" />
            <p className="text-sm">Select a customer to view their credit history</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold">{selectedGroup.name}</h1>
                {selectedGroup.phone && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {selectedGroup.phone}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={openEditDialog}
                  aria-label="Edit customer"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete customer"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setPayAmount("")
                    setPayNotes("")
                    setPayDate(todayIso())
                    setPayMethod("cash")
                    setPayOpen(true)
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Wallet className="size-4 mr-1.5" />
                  Record Payment
                </Button>
              </div>
            </div>

            {/* Balance summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Credit</p>
                <p className="font-bold text-slate-800 text-sm">
                  {formatCurrency(selectedGroup.totalOwed, currency)}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
                <p className="font-bold text-green-700 text-sm">
                  {formatCurrency(selectedGroup.totalPaid, currency)}
                </p>
              </div>
              <div
                className={`border rounded-lg p-4 ${
                  selectedGroup.outstanding > 0
                    ? "bg-red-50 border-red-200"
                    : "bg-green-50 border-green-200"
                }`}
              >
                <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
                <p
                  className={`font-bold text-sm ${
                    selectedGroup.outstanding > 0
                      ? "text-red-700"
                      : "text-green-700"
                  }`}
                >
                  {formatCurrency(selectedGroup.outstanding, currency)}
                </p>
              </div>
            </div>

            {/* Credit Sales table */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Credit Sales</h3>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                        Items
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                        Recorded By
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.sales.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          No credit sales
                        </td>
                      </tr>
                    ) : (
                      selectedGroup.sales.map((sale) => (
                        <tr key={sale.id} className="border-b last:border-0">
                          <td className="px-4 py-3">
                            {sale.sale?.sale_date
                              ? formatDate(sale.sale.sale_date)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">—</td>
                          <td className="px-4 py-3 text-right font-bold">
                            {formatCurrency(sale.amount_owed, currency)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">—</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment History */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Payments Received</h3>
              <div className="border rounded-lg overflow-x-auto">
                {paymentsLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    <span className="text-sm">Loading payments…</span>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Date
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Method
                        </th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                          Amount
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            No payments recorded
                          </td>
                        </tr>
                      ) : (
                        payments.map((p) => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="px-4 py-3">
                              {formatDate(p.payment_date)}
                            </td>
                            <td className="px-4 py-3">
                              {p.payment_method === "cash" ? (
                                <Badge className="bg-green-100 text-green-700 border-green-200">
                                  Cash
                                </Badge>
                              ) : (
                                <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                                  Mobile
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-green-700">
                              +{formatCurrency(p.amount, currency)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {p.notes ?? "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {selectedGroup && (
              <p className="text-sm text-muted-foreground">
                Outstanding:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(selectedGroup.outstanding, currency)}
                </span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                step="any"
                required
                autoFocus
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Payment Method</Label>
              <Select
                value={payMethod}
                onValueChange={(v) => setPayMethod(v as "cash" | "mobile_money")}
              >
                <SelectTrigger id="pay-method" className="w-full">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-notes">Notes (optional)</Label>
              <Input
                id="pay-notes"
                placeholder="Add a note…"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleRecordPayment}
              disabled={payLoading}
            >
              {payLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Customer Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Full Name</Label>
              <Input
                id="add-name"
                required
                autoFocus
                placeholder="Customer name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-phone">Phone Number (optional)</Label>
              <Input
                id="add-phone"
                type="tel"
                placeholder="+1 555 000 0000"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleAddCustomer}
              disabled={addLoading}
            >
              {addLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Add Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Customer Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                required
                autoFocus
                placeholder="Customer name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone Number (optional)</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="+1 555 000 0000"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleEditCustomer}
              disabled={editLoading}
            >
              {editLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {selectedGroup?.name}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteCustomer}
                disabled={deleteLoading}
              >
                {deleteLoading && (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
