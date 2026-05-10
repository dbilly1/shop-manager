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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRole, formatDate } from "@/utils/format";
import { UserPlus, Loader2, RefreshCw, XCircle, Copy, Check, Link2, Shuffle, UserMinus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { SessionContext, Role } from "@/types";
import {
  PERMISSION_DEFS,
  BASE_ROLE_DEFAULTS,
  type PermissionKey,
  type PermissionGroup,
} from "@/lib/permission-definitions";

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
  rolePermissions: Record<string, Record<string, boolean>>;
  memberOverrides: Record<string, Array<{ permission: string; granted: boolean }>>;
}

const GROUPS = [...new Set(PERMISSION_DEFS.map((d) => d.group))] as PermissionGroup[];

export function UsersClient({ members, invites, branches, session, rolePermissions, memberOverrides }: Props) {
  const router = useRouter();
  const [localMembers, setLocalMembers] = useState<Member[]>(members);
  const [localInvites, setLocalInvites] = useState<Invite[]>(invites);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("salesperson");
  const [inviteBranch, setInviteBranch] = useState("");
  const [inviteTempPassword, setInviteTempPassword] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resendLink, setResendLink] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState<string | null>(null);
  const [resendCopied, setResendCopied] = useState(false);

  // ── Member permissions panel ─────────────────────────────────────────────
  const [permissionsFor, setPermissionsFor] = useState<Member | null>(null);
  const [permState, setPermState] = useState<Record<PermissionKey, boolean>>({} as Record<PermissionKey, boolean>);
  const [savingPerms, setSavingPerms] = useState(false);
  // Local mirror so changes persist when re-opening without a full refresh
  const [localOverrides, setLocalOverrides] = useState(memberOverrides);

  /**
   * Compute effective permissions for a member:
   *   base defaults → role customisations → member overrides
   */
  function getEffective(member: Member): Record<PermissionKey, boolean> {
    const role = member.role as string;
    const base = BASE_ROLE_DEFAULTS[role] ?? ({} as Record<PermissionKey, boolean>);
    const roleCustom = rolePermissions[role] ?? {};
    const overrides = localOverrides[member.id] ?? [];

    const merged: Record<PermissionKey, boolean> = { ...base };
    for (const [k, v] of Object.entries(roleCustom) as [PermissionKey, boolean][]) {
      if (k in base) merged[k] = v;
    }
    for (const { permission, granted } of overrides) {
      if (permission in base) merged[permission as PermissionKey] = granted;
    }
    return merged;
  }

  /** Role-level effective (no member overrides) — used to detect member diffs */
  function getRoleEffective(member: Member): Record<PermissionKey, boolean> {
    const role = member.role as string;
    const base = BASE_ROLE_DEFAULTS[role] ?? ({} as Record<PermissionKey, boolean>);
    const roleCustom = rolePermissions[role] ?? {};
    const merged: Record<PermissionKey, boolean> = { ...base };
    for (const [k, v] of Object.entries(roleCustom) as [PermissionKey, boolean][]) {
      if (k in base) merged[k] = v;
    }
    return merged;
  }

  function openPermissions(member: Member) {
    setPermissionsFor(member);
    setPermState(getEffective(member));
  }

  function togglePerm(key: PermissionKey) {
    setPermState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function savePermissions() {
    if (!permissionsFor) return;
    setSavingPerms(true);

    const roleEffective = getRoleEffective(permissionsFor);

    // Only store overrides that differ from the role-level effective value
    const overrides = (Object.keys(permState) as PermissionKey[])
      .filter((k) => permState[k] !== roleEffective[k])
      .map((k) => ({ permission: k, granted: permState[k] }));

    const res = await fetch(`/api/users/members/${permissionsFor.id}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    });
    setSavingPerms(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error((d as { error?: string }).error ?? "Failed to save permissions");
      return;
    }

    // Update local mirror
    setLocalOverrides((prev) => ({
      ...prev,
      [permissionsFor.id]: overrides,
    }));

    toast.success("Permissions saved");
    setPermissionsFor(null);
    router.refresh();
  }

  const canEditMemberPerms = ["owner", "general_manager"].includes(session.role ?? "");

  function generatePassword(): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const digits = "23456789";
    const all = upper + lower + digits;
    const buf = new Uint32Array(13);
    crypto.getRandomValues(buf);
    const pick = (i: number, chars: string) => chars[buf[i] % chars.length];
    // Guarantee at least one of each group
    const required = pick(0, upper) + pick(1, lower) + pick(2, digits);
    const rest = Array.from({ length: 7 }, (_, i) => pick(3 + i, all)).join("");
    // Shuffle deterministically using remaining random bytes
    const arr = (required + rest).split("");
    for (let i = arr.length - 1; i > 0; i--) {
      const j = buf[10 + (i % 3)] % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join("");
  }

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
    if (!inviteTempPassword || inviteTempPassword.length < 6) {
      toast.error("Set a temporary password (min 6 characters)");
      return;
    }
    setLoading(true);

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        full_name: inviteName.trim() || undefined,
        role: inviteRole,
        branch_id: selectedRoleConfig?.requiresBranch ? inviteBranch : null,
        shop_id: session.shop_id,
        temp_password: inviteTempPassword,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error ?? "Failed to send invite");
    } else {
      const d = await res.json();
      setInviteLink(d.invite_link ?? null);
      router.refresh();
    }
    setLoading(false);
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeDialog() {
    setOpen(false);
    setInviteLink(null);
    setInviteEmail("");
    setInviteName("");
    setInviteRole("salesperson");
    setInviteBranch("");
    setInviteTempPassword("");
    setCopied(false);
  }

  async function resendInvite(id: string, email: string) {
    const res = await fetch(`/api/users/invite/${id}/resend`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Failed to resend");
    } else {
      const d = await res.json();
      if (d.invite_link) {
        setResendEmail(email);
        setResendLink(d.invite_link);
      } else {
        toast.success("Invite resent");
      }
    }
  }

  async function copyResendLink() {
    if (!resendLink) return;
    await navigator.clipboard.writeText(resendLink);
    setResendCopied(true);
    setTimeout(() => setResendCopied(false), 2000);
  }

  async function cancelInvite(id: string) {
    // Optimistically remove from list immediately
    setLocalInvites((prev) => prev.filter((inv) => inv.id !== id));

    const res = await fetch(`/api/users/invite/${id}`, { method: "DELETE" });
    if (!res.ok) {
      // Restore on failure
      setLocalInvites(invites);
      toast.error("Failed to cancel invite");
    } else {
      toast.success("Invite cancelled");
    }
  }

  async function removeMember(id: string) {
    // Optimistically remove from list
    setLocalMembers((prev) => prev.filter((m) => m.id !== id));

    const res = await fetch(`/api/users/members/${id}`, { method: "DELETE" });
    if (!res.ok) {
      // Restore on failure
      setLocalMembers(members);
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to remove member");
    } else {
      toast.success("Member removed");
    }
  }

  function canRemoveMember(m: Member): boolean {
    // Must be owner or GM to remove anyone
    if (!["owner", "general_manager"].includes(session.role ?? "")) return false;
    // Cannot remove yourself
    if (m.user_id === session.user_id) return false;
    // Cannot remove the shop owner
    if (m.role === "owner") return false;
    // GM cannot remove another GM — only owners can
    if (session.role === "general_manager" && m.role === "general_manager") return false;
    return true;
  }

  const activeMembers = localMembers.filter((m) => m.status === "active");

  return (
    <div className="space-y-4">
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
            Pending Invites ({localInvites.length})
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeMembers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
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
                        <div className="flex items-center gap-2">
                          {m.full_name ?? <span className="text-muted-foreground italic text-xs">{m.user_id.slice(0, 8)}…</span>}
                          {m.user_id === session.user_id && (
                            <span className="text-xs text-muted-foreground">(you)</span>
                          )}
                        </div>
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
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEditMemberPerms && m.role !== "owner" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => openPermissions(m)}
                              title="Edit permissions"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canRemoveMember(m) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setRemoveConfirmId(m.id)}
                              title="Remove member"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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
                {localInvites.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-muted-foreground text-sm"
                    >
                      No pending invites
                    </td>
                  </tr>
                ) : (
                  localInvites.map((inv) => (
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
                            onClick={() => resendInvite(inv.id, inv.email)}
                            title="Resend invite"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setCancelConfirmId(inv.id)}
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

      <Dialog open={open} onOpenChange={(o) => { if (o && !inviteLink) setInviteTempPassword(generatePassword()); if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteLink ? "Invite Created" : "Invite User"}
            </DialogTitle>
          </DialogHeader>

          {inviteLink ? (
            /* ── Step 2: show link + credentials ── */
            <div className="space-y-4 pt-1">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/15">
                  <Link2 className="h-4 w-4 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Account created</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Share the link and credentials below with{" "}
                    <span className="font-medium text-foreground">
                      {inviteName.trim() ? `${inviteName.trim()} (${inviteEmail})` : inviteEmail}
                    </span>.
                  </p>
                </div>
              </div>

              {/* Invite link */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Invite link</p>
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground font-mono">
                    {inviteLink}
                  </span>
                  <button
                    onClick={copyLink}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Copy link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Temp credentials */}
              <div className="rounded-md border bg-amber-500/10 px-3 py-2.5 space-y-1">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Temporary credentials</p>
                <p className="text-xs text-muted-foreground">
                  Email: <span className="font-mono font-medium text-foreground">{inviteEmail}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Password: <span className="font-mono font-medium text-foreground">{inviteTempPassword}</span>
                </p>
              </div>

              <Button className="w-full" onClick={closeDialog}>
                Done
              </Button>
            </div>
          ) : (
            /* ── Step 1: invite form ── */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="text"
                  placeholder="Jane Smith"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  autoComplete="off"
                />
              </div>
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
              {/* Temporary password */}
              <div className="space-y-2">
                <Label>Temporary password</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteTempPassword}
                    className="font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setInviteTempPassword(generatePassword())}
                    className="shrink-0 flex items-center justify-center w-9 h-9 rounded-md border bg-muted hover:bg-muted/80 transition-colors"
                    title="Generate new password"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this with the invitee — they&apos;ll use it to sign in.
                </p>
              </div>

              <Button
                onClick={handleInvite}
                disabled={loading}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Invite
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Cancel invite confirm dialog ── */}
      <Dialog open={!!cancelConfirmId} onOpenChange={(o) => { if (!o) setCancelConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel invite?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will revoke the invite link. The recipient will no longer be able to use it.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setCancelConfirmId(null)}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (cancelConfirmId) cancelInvite(cancelConfirmId);
                setCancelConfirmId(null);
              }}
            >
              Cancel invite
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Remove member confirm dialog ── */}
      <Dialog open={!!removeConfirmId} onOpenChange={(o) => { if (!o) setRemoveConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This member will immediately lose access to the shop. You can invite them again later if needed.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setRemoveConfirmId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (removeConfirmId) removeMember(removeConfirmId);
                setRemoveConfirmId(null);
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Member permissions dialog ── */}
      <Dialog open={!!permissionsFor} onOpenChange={(o) => { if (!o) setPermissionsFor(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {permissionsFor?.full_name ?? "Member"} — Permissions
            </DialogTitle>
          </DialogHeader>

          {permissionsFor && (() => {
            const roleEffective = getRoleEffective(permissionsFor);
            const hasOverrides = (localOverrides[permissionsFor.id] ?? []).length > 0;

            return (
              <div className="space-y-5 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize text-xs">
                    {formatRole(permissionsFor.role)}
                  </Badge>
                  {hasOverrides && (
                    <Badge variant="secondary" className="text-xs">
                      Has custom overrides
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground w-full">
                    Switches show the effective value for this member. Anything that differs
                    from the role default is saved as a personal override.
                  </p>
                </div>

                {GROUPS.map((group) => {
                  const defs = PERMISSION_DEFS.filter((d) => d.group === group);
                  return (
                    <div key={group}>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        {group}
                      </h3>
                      <div className="rounded-lg border overflow-hidden divide-y">
                        {defs.map((def) => {
                          const isOverride = permState[def.key] !== roleEffective[def.key];
                          return (
                            <div
                              key={def.key}
                              className="flex items-center justify-between px-4 py-3"
                            >
                              <div className="space-y-0.5 min-w-0 mr-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium">{def.label}</p>
                                  {isOverride && (
                                    <Badge variant="secondary" className="text-xs h-4 px-1.5 py-0">
                                      Override
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{def.description}</p>
                              </div>
                              <Switch
                                checked={permState[def.key] ?? false}
                                onCheckedChange={() => togglePerm(def.key)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center gap-3 pt-1">
                  <Button onClick={savePermissions} disabled={savingPerms}>
                    {savingPerms && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                  {hasOverrides && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={savingPerms}
                      onClick={() => setPermState(roleEffective)}
                    >
                      Reset to role defaults
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setPermissionsFor(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Resend link dialog ── */}
      <Dialog open={!!resendLink} onOpenChange={(o) => { if (!o) { setResendLink(null); setResendEmail(null); setResendCopied(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite Link Refreshed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/15">
                <Link2 className="h-4 w-4 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">New invite link ready</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Share this link with{" "}
                  <span className="font-medium text-foreground">{resendEmail}</span>. It expires in 72 hours.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground font-mono">
                {resendLink}
              </span>
              <button
                onClick={copyResendLink}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Copy link"
              >
                {resendCopied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
            <Button className="w-full" onClick={() => { setResendLink(null); setResendEmail(null); setResendCopied(false); }}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
