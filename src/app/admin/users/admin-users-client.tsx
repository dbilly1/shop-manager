"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { formatRole, formatDate } from "@/utils/format"
import { Search } from "lucide-react"

interface Member {
  id: string
  user_id: string
  role: string
  status: string
  created_at: string
  shop: { name: string } | null
  branch: { name: string } | null
}

interface Invite {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
  shop: { name: string } | null
  branch: { name: string } | null
}

interface Props {
  members: Member[]
  invites: Invite[]
}

export function AdminUsersClient({ members, invites }: Props) {
  const [search, setSearch] = useState("")

  const filteredMembers = members.filter((m) =>
    m.user_id.includes(search) ||
    m.shop?.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role.includes(search.toLowerCase())
  )

  const filteredInvites = invites.filter((i) =>
    i.email.toLowerCase().includes(search.toLowerCase()) ||
    i.shop?.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Platform Users</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by user ID, shop, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Active Members ({members.length})</TabsTrigger>
          <TabsTrigger value="invites">Pending Invites ({invites.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {filteredMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No members found</p>
              ) : (
                <div className="divide-y">
                  {filteredMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-3 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-xs">{m.user_id.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium font-mono">{m.user_id}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {m.shop?.name ?? "Unknown shop"}{m.branch ? ` · ${m.branch.name}` : " · All branches"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs capitalize">{formatRole(m.role)}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(m.created_at)}</span>
                      </div>
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
              {filteredInvites.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No pending invites</p>
              ) : (
                <div className="divide-y">
                  {filteredInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-3 gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.shop?.name ?? "Unknown shop"}{inv.branch ? ` · ${inv.branch.name}` : ""}
                          {" · "}{formatRole(inv.role)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                        <span className="text-xs text-muted-foreground">Expires {formatDate(inv.expires_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
