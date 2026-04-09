import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomBytes } from "crypto"
import { sendInviteEmail } from "@/lib/email"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  // Verify super admin
  const { data: superAdmin } = await admin.from("super_admins").select("id").eq("user_id", user.id).single()
  if (!superAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { name, type, currency, plan_id, owner_email } = await req.json()
  if (!name?.trim() || !owner_email?.trim()) {
    return NextResponse.json({ error: "Name and owner email are required" }, { status: 400 })
  }

  // Create the shop (owner_id set to super admin as placeholder)
  const { data: shop, error: shopError } = await admin.from("shops").insert({
    name: name.trim(),
    type: type ?? "general",
    owner_id: user.id,
    plan_id: plan_id ?? null,
    currency: currency ?? "USD",
    country: "US",
    timezone: "UTC",
  }).select().single()

  if (shopError || !shop) {
    return NextResponse.json({ error: shopError?.message ?? "Failed to create shop" }, { status: 400 })
  }

  // Create initial branch
  await admin.from("branches").insert({ shop_id: shop.id, name: "Main Branch" })

  // Create subscription
  await admin.from("shop_subscriptions").insert({
    shop_id: shop.id,
    plan_id: plan_id ?? null,
    status: "active",
  })

  // Check if owner email exists in auth
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers()
  const existingUser = authUsers.find((u) => u.email === owner_email.trim())

  let inviteLink: string | null = null

  if (existingUser) {
    // Add them directly as owner
    await admin.from("shop_members").insert({
      shop_id: shop.id,
      user_id: existingUser.id,
      role: "owner",
      status: "active",
      branch_id: null,
    })
    // Update the shop's owner_id
    await admin.from("shops").update({ owner_id: existingUser.id }).eq("id", shop.id)
  } else {
    // Create invite for owner
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days

    await admin.from("shop_invites").insert({
      shop_id: shop.id,
      email: owner_email.trim(),
      role: "owner",
      token,
      expires_at: expiresAt,
      invited_by: user.id,
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    inviteLink = `${appUrl}/invite/${token}`

    await sendInviteEmail({
      to: owner_email.trim(),
      inviteLink,
      shopName: name.trim(),
      role: "owner",
    })
  }

  return NextResponse.json({ success: true, shop_id: shop.id, invite_link: inviteLink })
}
