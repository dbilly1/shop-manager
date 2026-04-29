import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole } from "@/lib/auth-guard"

export async function POST(req: NextRequest) {
  const guard = await requireRole(["owner"])
  if (guard instanceof NextResponse) return guard

  const { plan_id } = await req.json()
  if (!plan_id || typeof plan_id !== "string") {
    return NextResponse.json({ error: "Plan is required" }, { status: 400 })
  }

  const shopId = guard.shop_id
  if (!shopId) {
    return NextResponse.json({ error: "No shop found" }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id, max_branches, max_users, max_products, max_customers, is_active")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single()

  if (planError || !plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 })
  }

  const [
    { count: userCount, error: userError },
    { count: branchCount, error: branchError },
    { count: productCount, error: productError },
    { count: customerCount, error: customerError },
  ] = await Promise.all([
    admin
      .from("shop_members")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("status", "active"),
    admin
      .from("branches")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("status", "active"),
    admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("is_active", true),
    admin
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId),
  ])

  const countError = userError ?? branchError ?? productError ?? customerError
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 })
  }

  const usage = {
    users: userCount ?? 0,
    branches: branchCount ?? 0,
    products: productCount ?? 0,
    customers: customerCount ?? 0,
  }

  if (usage.users > plan.max_users) {
    return NextResponse.json(
      { error: `This shop has ${usage.users} active users, but that plan allows ${plan.max_users}.` },
      { status: 400 },
    )
  }
  if (usage.branches > plan.max_branches) {
    return NextResponse.json(
      { error: `This shop has ${usage.branches} active branches, but that plan allows ${plan.max_branches}.` },
      { status: 400 },
    )
  }
  if (usage.products > plan.max_products) {
    return NextResponse.json(
      { error: `This shop has ${usage.products} active products, but that plan allows ${plan.max_products}.` },
      { status: 400 },
    )
  }
  if (usage.customers > plan.max_customers) {
    return NextResponse.json(
      { error: `This shop has ${usage.customers} customers, but that plan allows ${plan.max_customers}.` },
      { status: 400 },
    )
  }

  const { data: updatedSubscriptions, error: subscriptionError } = await admin
    .from("shop_subscriptions")
    .update({ plan_id, status: "active" })
    .eq("shop_id", shopId)
    .select("id")

  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message }, { status: 400 })
  }

  if (!updatedSubscriptions?.length) {
    const { error: insertError } = await admin.from("shop_subscriptions").insert({
      shop_id: shopId,
      plan_id,
      status: "active",
    })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }
  }

  const { error: shopError } = await admin
    .from("shops")
    .update({ plan_id })
    .eq("id", shopId)

  if (shopError) {
    return NextResponse.json({ error: shopError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
