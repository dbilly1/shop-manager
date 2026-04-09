import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomBytes } from "crypto"
import { sendInviteEmail } from "@/lib/email"

export async function POST(req: NextRequest) {
  const { email, role, branch_id, shop_id } = await req.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  // Check caller has permission
  const { data: caller } = await admin
    .from("shop_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("shop_id", shop_id)
    .single()

  if (!caller || !["owner", "general_manager", "branch_manager"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Enforce plan user limit
  const { data: subscription } = await admin
    .from("shop_subscriptions")
    .select("plan:plans(max_users)")
    .eq("shop_id", shop_id)
    .eq("status", "active")
    .single()

  const maxUsers = (subscription?.plan as unknown as { max_users: number } | null)?.max_users ?? 10

  const { count: currentUsers } = await admin
    .from("shop_members")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", shop_id)
    .eq("status", "active")

  if ((currentUsers ?? 0) >= maxUsers) {
    return NextResponse.json(
      { error: `User limit reached (${currentUsers}/${maxUsers}). Upgrade your plan to invite more users.` },
      { status: 403 }
    )
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from("shop_invites").insert({
    shop_id,
    branch_id: branch_id || null,
    email,
    role,
    token,
    expires_at: expiresAt,
    invited_by: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteLink = `${appUrl}/invite/${token}`

  const { data: shop } = await admin.from("shops").select("name").eq("id", shop_id).single()

  await sendInviteEmail({
    to: email,
    inviteLink,
    shopName: shop?.name ?? "your shop",
    role,
  })

  return NextResponse.json({ success: true, invite_link: inviteLink })
}
