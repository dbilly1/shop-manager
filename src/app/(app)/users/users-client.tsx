"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRole, formatDate } from "@/utils/format";
import { UserPlus, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { SessionContext, Role } from "@/types";

const INVITABLE_ROLES: {
  value: Role;
  label: string;
  requiresBranch: boolean;
}[] = [
  { value: "general_manager", label: "General Manager", requiresBranch: false },
  {
    value: "general_supervisor",
    label: "General Supervisor",
    requiresBranch: false,
  },
  { value: "branch_manager", label: "Branch Manager", requiresBranch: true },
  {
    value: "branch_supervisor",
    label: "Branch Supervisor",
    requiresBranch: true,
  },
  { value: "salesperson", label: "Salesperson", requiresBranch: true },
];

interface Member {
  id: string;
  user_id: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
  branch: { name: string } | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  branch: { name: string } | null;
}

interface Props {
  members: Member[];
  invites: Invite[];
  branches: { id: string; name: string }[];
  session: SessionContext;
}

export function UsersClient({ members, invites, branches, session }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("salesperson");
  const [inviteBranch, setInviteBranch] = useState("");

  const canInvite = ["owner", "general_manager", "branch_manager"].includes(
    session.role ?? "",
  );
  const selectedRoleConfig = INVITABLE_ROLES.find(
    (r) => r.value === inviteRole,
  );

  async function handleInvite() {
    if (!inviteEmail) {
      toast.error("Enter an email address");
      return;
    }
    if (selectedRoleConfig?.requiresBranch && !inviteBranch) {
      toast.error("Select a branch for this role");
      return;
    }
    setLoading(true);

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole,
        branch_id: selectedRoleConfig?.requiresBranch ? inviteBranch : null,
        shop_id: session.shop_id,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error ?? "Failed to send invite");
    } else {
      toast.success(`Invite sent to ${inviteEmail}`);
      setOpen(false);
      setInviteEmail("");
      router.refresh();
    }
    setLoading(false);
  }

  async function resendInvite(id: string) {
    const res = await fetch(`/api/users/invite/${id}/resend`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Failed to resend");
    } else {
      toast.success("Invite resent");
    }
  }

  async function cancelInvite(id: string) {
    const res = await fetch(`/api/users/invite/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to cancel");
    } else {
      toast.success("Invite cancelled");
      router.refresh();
    }
  }

  const activeMembers = members.filter((m) => m.status === "active");

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
          <TabsTrigger value="members">
            Members ({activeMembers.length})
          </TabsTrigger>
          <TabsTrigger value="invites">
            Pending Invites ({invites.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Branch
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeMembers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-muted-foreground text-sm"
                    >
                      No members yet
                    </td>
                  </tr>
                ) : (
                  activeMembers.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {m.full_name ?? <span className="text-muted-foreground italic text-xs">{m.user_id.slice(0, 8)}…</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="capitalize text-xs">
                          {formatRole(m.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.branch ? (
                          m.branch.name
                        ) : (
                          <span className="italic text-muted-foreground/50">
                            All branches
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(m.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Branch
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                    Expires
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invites.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-muted-foreground text-sm"
                    >
                      No pending invites
                    </td>
                  </tr>
                ) : (
                  invites.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{inv.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="capitalize text-xs">
                          {formatRole(inv.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {inv.branch ? (
                          inv.branch.name
                        ) : (
                          <span className="italic text-muted-foreground/50">
                            All branches
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(inv.expires_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Badge variant="secondary" className="text-xs">
                            Pending
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => resendInvite(inv.id)}
                            title="Resend invite"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => cancelInvite(inv.id)}
                            title="Cancel invite"
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
          </DialogHeader>
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
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as Role)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.filter(
                    (r) =>
                      session.role === "owner" ||
                      (session.role === "general_manager" &&
                        r.value !== "general_manager") ||
                      (session.role === "branch_manager" && r.requiresBranch),
                  ).map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRoleConfig?.requiresBranch && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={inviteBranch}
                  onValueChange={(v) => setInviteBranch(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              onClick={handleInvite}
              disabled={loading}
              className="w-full"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invite
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
