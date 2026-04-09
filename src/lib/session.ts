import { createClient } from "@/lib/supabase/server"
import type { SessionContext, Role } from "@/types"

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", user.id)
    .single()

  const fullName: string | null =
    (user.user_metadata?.full_name as string | undefined) ?? null

  if (superAdmin) {
    return {
      user_id: user.id,
      full_name: fullName,
      shop_id: null,
      branch_id: null,
      role: "super_admin",
      is_super_admin: true,
    }
  }

  const { data: member } = await supabase
    .from("shop_members")
    .select("shop_id, branch_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (!member) return null

  return {
    user_id: user.id,
    full_name: fullName,
    shop_id: member.shop_id,
    branch_id: member.branch_id,
    role: member.role as Role,
    is_super_admin: false,
  }
}

// Re-export permission helpers for server-side use
export {
  canAccessConsolidatedView,
  canManageStaff,
  canManageBilling,
  canApproveAdjustments,
  canBackdateSales,
  canManageInventory,
  canViewReports,
  canManageExpenses,
  canManageCredit,
  canInitiateTransfers,
  canApproveTransfers,
  canViewAuditLog,
  canManageShopSettings,
} from "@/lib/permissions"
