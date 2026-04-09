"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatDate } from "@/utils/format"
import { Search, MoreHorizontal, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

interface ShopRow {
  id: string
  name: string
  status: string
  plan_name: string
  branch_count: number
  user_count: number
  created_at: string
}

interface Props {
  shops: ShopRow[]
  plans: { id: string; name: string }[]
}

export function AdminShopsClient({ shops, plans }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loading, setLoading] = useState<string | null>(null)

  // Create shop dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState("general")
  const [newCurrency, setNewCurrency] = useState("USD")
  const [newPlanId, setNewPlanId] = useState(plans[0]?.id ?? "")
  const [newOwnerEmail, setNewOwnerEmail] = useState("")

  async function handleCreate() {
    if (!newName.trim() || !newOwnerEmail.trim()) {
      setCreateError("Shop name and owner email are required")
      return
    }
    setCreating(true)
    setCreateError("")
    const res = await fetch("/api/admin/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        type: newType,
        currency: newCurrency,
        plan_id: newPlanId || null,
        owner_email: newOwnerEmail.trim(),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setCreateError(data.error ?? "Failed to create shop")
    } else {
      if (data.invite_link) {
        setInviteLink(data.invite_link)
        toast.success("Shop created — invite link generated")
      } else {
        toast.success("Shop created and owner added")
        setCreateOpen(false)
        resetForm()
        router.refresh()
      }
    }
    setCreating(false)
  }

  function resetForm() {
    setNewName("")
    setNewType("general")
    setNewCurrency("USD")
    setNewPlanId(plans[0]?.id ?? "")
    setNewOwnerEmail("")
    setCreateError("")
    setInviteLink(null)
  }

  const filtered = shops.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === "all" || s.status === statusFilter)
  )

  async function updateStatus(shopId: string, status: string) {
    setLoading(shopId)
    const res = await fetch("/api/admin/shops/" + shopId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? "Failed")
    } else {
      toast.success(`Shop ${status}`)
      router.refresh()
    }
    setLoading(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Shops</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{shops.length} total</Badge>
          <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Shop
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search shops..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "")}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No shops found</CardContent></Card>
        ) : (
          filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.branch_count} branch(es) · {s.user_count} user(s) · Created {formatDate(s.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">{s.plan_name}</Badge>
                    <Badge variant={s.status === "active" ? "secondary" : "destructive"} className="text-xs capitalize">{s.status}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-muted transition-colors disabled:pointer-events-none disabled:opacity-50" disabled={loading === s.id}>
                        {loading === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status !== "active" && (
                          <DropdownMenuItem onClick={() => updateStatus(s.id, "active")}>Activate</DropdownMenuItem>
                        )}
                        {s.status === "active" && (
                          <DropdownMenuItem onClick={() => updateStatus(s.id, "suspended")} className="text-destructive">Suspend</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Shop</DialogTitle></DialogHeader>
          {inviteLink ? (
            <div className="space-y-4">
              <p className="text-sm">Shop created. The owner email wasn't found in the system, so an invite was sent. Copy the link below if needed:</p>
              <Input value={inviteLink} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
              <Button className="w-full" onClick={() => { setCreateOpen(false); resetForm(); router.refresh() }}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {createError && <Alert variant="destructive"><AlertDescription>{createError}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label>Shop Name <span className="text-destructive">*</span></Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme Store" />
              </div>
              <div className="space-y-2">
                <Label>Owner Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="owner@example.com" />
                <p className="text-xs text-muted-foreground">If the user doesn't have an account yet, an invite link will be generated.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={(v) => setNewType(v ?? "general")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["general", "cold_store", "pharmacy", "hardware", "boutique", "other"].map((t) => (
                        <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={newCurrency} onValueChange={(v) => setNewCurrency(v ?? "USD")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "NGN", "GHS", "KES", "ZAR"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={newPlanId} onValueChange={(v) => setNewPlanId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Shop
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
