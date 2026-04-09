"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatRole, formatDate } from "@/utils/format"
import { UserPlus, Loader2, RefreshCw, XCircle } from "lucide-react"
import { toast } from "sonner"
import type { SessionContext, Role } from "@/types"

const INVITABLE_ROLES: { value: Role; label: string; requiresBranch: boolean }[] = [
  { value: "general_manager", label: "General Manager", requiresBranch: false },
  { value: "general_supervisor", label: "General Supervisor", requiresBranch: false },
  { value: "branch_manager", label: "Branch Manager", requiresBranch: true },
  { value: "branch_supervisor", label: "Branch Supervisor", requiresBranch: true },
  { value: "salesperson", label: "Salesperson", requiresBranch: true },
]

interface Member {
  id: string
  user_id: string
  role: string
  status: string
  created_at: string
  branch: { name: string } | null
}

interface Invite {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
  branch: { name: string } | null
}

interface Props {
  members: Member[]
  invites: Invite[]
  branches: { id: string; name: string }[]
  session: SessionContext
}

export function UsersClient({ members, invites, branches, session }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("salesperson")
  const [inviteBranch, setInviteBranch] = useState("")

  const canInvite = ["owner", "general_manager", "branch_manager"].includes(session.role ?? "")
  const selectedRoleConfig = INVITABLE_ROLES.find((r) => r.value === inviteRole)

  async function handleInvite() {
    if (!inviteEmail) {
      toast.error("Enter an email address")
      return
    }
    if (selectedRoleConfig?.requiresBranch && !inviteBranch) {
      toast.error("Select a branch for this role")
      return
    }
    setLoading(true)

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole,
        branch_id: selectedRoleConfig?.requiresBranch ? inviteBranch : null,
        shop_id: session.shop_id,
      }),
    })

    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? "Failed to send invite")
    } else {
      toast.success(`Invite sent to ${inviteEmail}`)
      setOpen(false)
      setInviteEmail("")
      router.refresh()
    }
    setLoading(false)
  }

  async function resendInvite(id: string) {
    const res = await fetch(`/api/users/invite/${id}/resend`, { method: "POST" })
    if (!res.ok) {
      toast.error("Failed to resend")
    } else {
      toast.success("Invite resent")
    }
  }

  async function cancelInvite(id: string) {
    const res = await fetch(`/api/users/invite/${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to cancel")
    } else {
      toast.success("Invite cancelled")
      router.refresh()
    }
  }

  const activeMembers = members.filter((m) => m.status === "active")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users</h1>
        {canInvite && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite User
          </Button>
        )}
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members ({activeMembers.length})</TabsTrigger>
          <TabsTrigger value="invites">Pending Invites ({invites.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {activeMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No members yet</p>
              ) : (
                <div className="divide-y">
                  {activeMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{m.user_id.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{m.user_id.slice(0, 8)}…</p>
                          <p className="text-xs text-muted-foreground">
                            {m.branch ? m.branch.name : "All branches"}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize text-xs">
                        {formatRole(m.role)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {invites.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No pending invites</p>
              ) : (
                <div className="divide-y">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRole(inv.role)}{inv.branch ? ` · ${inv.branch.name}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">Expires {formatDate(inv.expires_at)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => resendInvite(inv.id)}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cancelInvite(inv.id)}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES
                    .filter((r) => session.role === "owner" || (session.role === "general_manager" && r.value !== "general_manager") || (session.role === "branch_manager" && r.requiresBranch))
                    .map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedRoleConfig?.requiresBranch && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={inviteBranch} onValueChange={(v) => setInviteBranch(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleInvite} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invite
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
