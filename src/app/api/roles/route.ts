import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { PERMISSION_KEYS } from "@/lib/permission-definitions"

/**
 * POST /api/roles
 * Body: { role: string; permissions: Record<PermissionKey, boolean> }
 *
 * Upserts shop_role_permissions for the caller's shop.
 * Owner-only — the RLS policy enforces this at DB level too.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { role, permissions } = body as {
    role: string
    permissions: Record<string, boolean>
  }

  if (!role || !permissions || typeof permissions !== "object") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  // Verify caller is an owner in this shop
  const { data: actor } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (!actor || actor.role !== "owner") {
    return NextResponse.json(
      { error: "Only shop owners can configure role permissions" },
      { status: 403 }
    )
  }

  // Sanitise: only accept known permission keys
  const sanitized: Record<string, boolean> = {}
  for (const key of PERMISSION_KEYS) {
    if (typeof permissions[key] === "boolean") {
      sanitized[key] = permissions[key]
    }
  }

  const { error } = await supabase.from("shop_role_permissions").upsert(
    {
      shop_id: actor.shop_id,
      role,
      permissions: sanitized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop_id,role" }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
