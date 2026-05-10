import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { PERMISSION_KEYS } from "@/lib/permission-definitions"

interface Override {
  permission: string
  granted: boolean
}

/**
 * POST /api/users/members/[id]/permissions
 * Body: { overrides: Array<{ permission: string; granted: boolean }> }
 *
 * Replaces all member_permission_overrides for the given member.
 * Send an empty array to clear all overrides (restore to role defaults).
 *
 * Owner and GM only — RLS enforces the same at DB level.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: memberId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify caller role
  const { data: actor } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (!actor || !["owner", "general_manager"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Verify target member belongs to the same shop
  const { data: target } = await supabase
    .from("shop_members")
    .select("id, shop_id, role")
    .eq("id", memberId)
    .single()

  if (!target || target.shop_id !== actor.shop_id) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  // GMs cannot modify owners or other GMs
  if (
    actor.role === "general_manager" &&
    ["owner", "general_manager"].includes(target.role)
  ) {
    return NextResponse.json(
      { error: "Insufficient permissions to modify this member" },
      { status: 403 }
    )
  }

  const body = await req.json()
  const rawOverrides: Override[] = body.overrides ?? []

  // Filter to valid permission keys only
  const validOverrides = rawOverrides.filter(
    (o) =>
      PERMISSION_KEYS.includes(o.permission as (typeof PERMISSION_KEYS)[number]) &&
      typeof o.granted === "boolean"
  )

  // Replace strategy: delete all then insert new ones
  const { error: delErr } = await supabase
    .from("member_permission_overrides")
    .delete()
    .eq("member_id", memberId)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  if (validOverrides.length > 0) {
    const { error: insErr } = await supabase
      .from("member_permission_overrides")
      .insert(
        validOverrides.map((o) => ({
          shop_id: actor.shop_id,
          member_id: memberId,
          permission: o.permission,
          granted: o.granted,
        }))
      )

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
