"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/utils/format"
import { Plus, Search, Loader2 } from "lucide-react"
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
    if (!phone.trim()) {
      toast.error("Phone number is required")
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
    <div className="space-y-4">
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

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Email</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Outstanding</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  No customers found
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? <span className="text-muted-foreground/40 italic">—</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? <span className="text-muted-foreground/40 italic">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.outstanding_credit > 0
                      ? <span className="font-semibold text-red-600">{formatCurrency(c.outstanding_credit, currency)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.outstanding_credit > 0
                      ? <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs">Owing</Badge>
                      : <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 text-xs">Clear</Badge>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
              <Label>Phone <span className="text-destructive">*</span></Label>
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
