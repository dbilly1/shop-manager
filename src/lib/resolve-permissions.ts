import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import {
  BASE_ROLE_DEFAULTS,
  PERMISSION_KEYS,
  NO_PERMISSIONS,
  type PermissionKey,
  type RoleDefaults,
} from "./permission-definitions"
import type { SessionContext } from "@/types"

export type EffectivePermissions = RoleDefaults

/**
 * Resolve the effective permissions for the current session.
 *
 * Resolution order (highest priority first):
 *   1. Member-level overrides   (member_permission_overrides)
 *   2. Role customisation       (shop_role_permissions)
 *   3. Hardcoded base defaults  (BASE_ROLE_DEFAULTS)
 *
 * Wrapped in React `cache()` so multiple callers in the same request share
 * a single DB round-trip.
 */
export const resolvePermissions = cache(
  async (session: SessionContext): Promise<EffectivePermissions> => {
    // Owners and super-admins always get the full owner permission set.
    if (session.role === "owner" || session.role === "super_admin") {
      return BASE_ROLE_DEFAULTS["owner"]
    }

    // No role or shop → no permissions.
    if (!session.role || !session.shop_id) return NO_PERMISSIONS

    const baseDefaults = BASE_ROLE_DEFAULTS[session.role] ?? NO_PERMISSIONS
    const supabase = await createClient()

    // ── Layer 2: shop-level role customisation ────────────────────────────────
    const { data: roleRow } = await supabase
      .from("shop_role_permissions")
      .select("permissions")
      .eq("shop_id", session.shop_id)
      .eq("role", session.role)
      .maybeSingle()

    const roleOverrides = (roleRow?.permissions ?? {}) as Partial<
      Record<PermissionKey, boolean>
    >

    // ── Layer 1: per-member overrides ─────────────────────────────────────────
    const memberOverrides: Partial<Record<PermissionKey, boolean>> = {}
    if (session.member_id) {
      const { data: memberRows } = await supabase
        .from("member_permission_overrides")
        .select("permission, granted")
        .eq("member_id", session.member_id)

      for (const row of memberRows ?? []) {
        if (PERMISSION_KEYS.includes(row.permission as PermissionKey)) {
          memberOverrides[row.permission as PermissionKey] = row.granted
        }
      }
    }

    // ── Merge ─────────────────────────────────────────────────────────────────
    const effective = {} as EffectivePermissions
    for (const key of PERMISSION_KEYS) {
      effective[key] =
        memberOverrides[key] ?? roleOverrides[key] ?? baseDefaults[key]
    }
    return effective
  }
)
