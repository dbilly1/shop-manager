import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole } from "@/lib/auth-guard"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Only owners and general managers can remove members
  const guard = await requireRole(["owner", "general_manager"])
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const admin = createAdminClient()

  // Fetch the target membership — must belong to the same shop
  const { data: target, error: fetchError } = await admin
    .from("shop_members")
    .select("id, shop_id, user_id, role, status")
    .eq("id", id)
    .single()

  if (fetchError || !target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  if (target.shop_id !== guard.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Cannot remove yourself
  if (target.user_id === guard.user_id) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 })
  }

  // Cannot remove the shop owner
  if (target.role === "owner") {
    return NextResponse.json({ error: "The shop owner cannot be removed" }, { status: 400 })
  }

  // General managers cannot remove other general managers — only owners can
  if (guard.role === "general_manager" && target.role === "general_manager") {
    return NextResponse.json(
      { error: "Only the shop owner can remove a General Manager" },
      { status: 403 },
    )
  }

  // Soft-delete: set status inactive so the member loses access immediately
  // but the membership row is kept for audit history.
  const { error: updateError } = await admin
    .from("shop_members")
    .update({ status: "inactive" })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // ── Clean up the auth user if they have no other active memberships ──────
  // If the user belongs to other shops we leave the auth account alone.
  // If this was their only shop, remove them from Supabase Auth entirely so
  // they don't remain as a ghost account in the auth users list.
  const { count: otherMemberships } = await admin
    .from("shop_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", target.user_id)
    .eq("status", "active")

  if ((otherMemberships ?? 0) === 0) {
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(target.user_id)
    if (deleteAuthError) {
      // Non-fatal — membership is already deactivated, log and continue.
      console.warn("[members/remove] Could not delete auth user:", deleteAuthError.message)
    }
  }

  return NextResponse.json({ success: true })
}
