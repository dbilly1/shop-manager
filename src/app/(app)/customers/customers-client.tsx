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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/utils/format"
import { Plus, Search, Loader2, UserCircle } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext } from "@/types"

interface CustomerWithCredit {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  branch_id: string
  credit_limit: number
  outstanding_credit: number
}

interface Props {
  customers: CustomerWithCredit[]
  currency: string
  session: SessionContext
  branches: { id: string; name: string }[]
}

export function CustomersClient({ customers, currency, session, branches }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [branchId, setBranchId] = useState(session.branch_id ?? "")

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
  )

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Enter a customer name")
      return
    }
    const bid = session.branch_id ?? branchId
    if (!bid) {
      toast.error("Select a branch")
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from("customers").insert({
      shop_id: session.shop_id,
      branch_id: bid,
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      address: address || null,
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Customer added")
      setOpen(false)
      setName("")
      setPhone("")
      setEmail("")
      setAddress("")
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Customers</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or phone..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No customers found</CardContent></Card>
        ) : (
          filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-full bg-muted p-2 shrink-0">
                      <UserCircle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.phone ?? "No phone"}{c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {c.outstanding_credit > 0 ? (
                      <>
                        <p className="text-sm font-medium text-red-600">{formatCurrency(c.outstanding_credit, currency)}</p>
                        <p className="text-xs text-muted-foreground">Outstanding</p>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-green-700 border-green-300 text-xs">Clear</Badge>
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
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!session.branch_id && branches.length > 0 && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Address <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <Button onClick={handleCreate} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
