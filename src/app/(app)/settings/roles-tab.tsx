"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import {
  PERMISSION_DEFS,
  BASE_ROLE_DEFAULTS,
  type PermissionKey,
  type PermissionGroup,
} from "@/lib/permission-definitions"
import { formatRole } from "@/utils/format"
import type { Role } from "@/types"

const CONFIGURABLE_ROLES = [
  "general_manager",
  "general_supervisor",
  "branch_manager",
  "branch_supervisor",
  "salesperson",
] as const satisfies ReadonlyArray<Role>

type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number]

/** Stored custom permissions per role (what the shop has saved). */
type SavedPermissions = Record<string, Record<string, boolean>>

interface Props {
  savedPermissions: SavedPermissions
}

const GROUPS = [
  ...new Set(PERMISSION_DEFS.map((d) => d.group)),
] as PermissionGroup[]

export function RolesTab({ savedPermissions }: Props) {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<ConfigurableRole>("general_manager")
  const [saving, setSaving] = useState(false)

  /**
   * Local mirror of saved permissions so switching roles after a save still
   * reflects the correct state without needing a full page refresh.
   */
  const [localSaved, setLocalSaved] = useState<SavedPermissions>(savedPermissions)

  // Build effective permissions for a role: base defaults + shop customisations
  function buildEffective(role: ConfigurableRole): Record<PermissionKey, boolean> {
    const base = BASE_ROLE_DEFAULTS[role]
    const stored = localSaved[role] ?? {}
    const merged: Record<PermissionKey, boolean> = { ...base }
    for (const key of Object.keys(stored) as PermissionKey[]) {
      if (key in base) merged[key] = stored[key]
    }
    return merged
  }

  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(
    () => buildEffective("general_manager")
  )

  function switchRole(role: ConfigurableRole) {
    setSelectedRole(role)
    setPermissions(buildEffective(role))
  }

  function toggle(key: PermissionKey) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function resetToDefaults() {
    setPermissions(BASE_ROLE_DEFAULTS[selectedRole])
  }

  const baseDefaults = BASE_ROLE_DEFAULTS[selectedRole]

  // True if any permission differs from the hardcoded base default
  const hasChangesFromBase = PERMISSION_DEFS.some(
    (d) => permissions[d.key] !== baseDefaults[d.key]
  )

  async function save() {
    setSaving(true)
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: selectedRole, permissions }),
    })
    setSaving(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error((d as { error?: string }).error ?? "Failed to save")
      return
    }

    // Update local mirror so switching roles shows the right state
    setLocalSaved((prev) => ({
      ...prev,
      [selectedRole]: { ...permissions },
    }))

    toast.success("Role permissions saved")
    router.refresh()
  }

  return (
    <div className="space-y-6">

      {/* ── Role selector ── */}
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          Configure what each role can do by default. Individual members can be
          given additional permissions (or have permissions removed) on the
          Users page.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CONFIGURABLE_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => switchRole(role)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selectedRole === role
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {formatRole(role)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Permissions grouped ── */}
      <div className="space-y-6 max-w-2xl">
        {GROUPS.map((group) => {
          const defs = PERMISSION_DEFS.filter((d) => d.group === group)
          return (
            <div key={group}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group}
              </h3>
              <div className="rounded-lg border overflow-hidden divide-y">
                {defs.map((def) => {
                  const isModified = permissions[def.key] !== baseDefaults[def.key]
                  return (
                    <div
                      key={def.key}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="space-y-0.5 min-w-0 mr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{def.label}</p>
                          {isModified && (
                            <Badge
                              variant="secondary"
                              className="text-xs h-4 px-1.5 py-0"
                            >
                              Modified
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {def.description}
                        </p>
                      </div>
                      <Switch
                        checked={permissions[def.key]}
                        onCheckedChange={() => toggle(def.key)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
        {hasChangesFromBase && (
          <Button variant="ghost" size="sm" onClick={resetToDefaults}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        )}
      </div>
    </div>
  )
}
