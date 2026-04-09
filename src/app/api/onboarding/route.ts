import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { shopName, shopType, currency, branchName, branchAddress } = await req.json()

  if (!shopName?.trim() || !branchName?.trim()) {
    return NextResponse.json({ error: "Shop name and branch name are required" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Make sure this user doesn't already have a shop
  const { data: existing } = await admin
    .from("shop_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (existing) {
    return NextResponse.json({ error: "You already belong to a shop" }, { status: 400 })
  }

  // Get free plan
  const { data: freePlan } = await admin.from("plans").select("id").eq("name", "Free").single()

  // Create shop
  const { data: shop, error: shopError } = await admin.from("shops").insert({
    name: shopName.trim(),
    type: shopType ?? "general",
    owner_id: user.id,
    plan_id: freePlan?.id ?? null,
    currency: currency ?? "USD",
    country: "US",
    timezone: "UTC",
  }).select().single()

  if (shopError || !shop) {
    return NextResponse.json({ error: shopError?.message ?? "Failed to create shop" }, { status: 400 })
  }

  // Create first branch
  const { data: branch, error: branchError } = await admin.from("branches").insert({
    shop_id: shop.id,
    name: branchName.trim(),
    address: branchAddress?.trim() || null,
  }).select().single()

  if (branchError || !branch) {
    return NextResponse.json({ error: branchError?.message ?? "Failed to create branch" }, { status: 400 })
  }

  // Create owner membership
  const { error: memberError } = await admin.from("shop_members").insert({
    shop_id: shop.id,
    branch_id: null,
    user_id: user.id,
    role: "owner",
    status: "active",
  })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 })
  }

  // Create free subscription
  await admin.from("shop_subscriptions").insert({
    shop_id: shop.id,
    plan_id: freePlan?.id ?? null,
    status: "active",
  })

  return NextResponse.json({ success: true, shop_id: shop.id })
}
