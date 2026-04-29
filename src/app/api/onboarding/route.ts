import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isValidCurrency, DEFAULT_CURRENCY } from "@/lib/constants"
import { SUPPORTED_TIMEZONES, SUPPORTED_COUNTRIES } from "@/lib/onboarding-options"

// ── GET /api/onboarding — returns active plans (public, no auth) ──────────────
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("plans")
    .select("id, name, price_monthly, max_branches, max_users, max_products, feature_flags")
    .eq("is_active", true)
    .order("price_monthly")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ plans: data ?? [] })
}

// ── POST /api/onboarding — create shop atomically ─────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const {
    shopName,
    shopType,
    currency,
    country,
    timezone,
    branchName,
    branchAddress,
    planId,
  } = await req.json()

  // ── Validate required fields ──────────────────────────────────────────────
  if (!shopName?.trim()) {
    return NextResponse.json({ error: "Shop name is required" }, { status: 400 })
  }
  if (!branchName?.trim()) {
    return NextResponse.json({ error: "Branch name is required" }, { status: 400 })
  }

  const normalizedCurrency = (currency ?? DEFAULT_CURRENCY).toUpperCase()
  if (!isValidCurrency(normalizedCurrency)) {
    return NextResponse.json({ error: `Unsupported currency: ${currency}` }, { status: 400 })
  }

  const normalizedCountry = (country ?? "US").toUpperCase()
  if (!SUPPORTED_COUNTRIES.some((c) => c.code === normalizedCountry)) {
    return NextResponse.json({ error: `Unsupported country: ${country}` }, { status: 400 })
  }

  const normalizedTimezone = timezone ?? "UTC"
  if (!SUPPORTED_TIMEZONES.includes(normalizedTimezone)) {
    return NextResponse.json({ error: `Unsupported timezone: ${timezone}` }, { status: 400 })
  }

  const admin = createAdminClient()

  // Resolve plan — use the caller's chosen plan if valid, otherwise fall back to Free
  let resolvedPlanId: string | null = null
  if (planId) {
    const { data: chosenPlan } = await admin
      .from("plans")
      .select("id")
      .eq("id", planId)
      .eq("is_active", true)
      .single()
    resolvedPlanId = chosenPlan?.id ?? null
  }
  if (!resolvedPlanId) {
    const { data: freePlan } = await admin.from("plans").select("id").eq("name", "Free").single()
    resolvedPlanId = freePlan?.id ?? null
  }

  // ── Atomic creation via RPC ───────────────────────────────────────────────
  const { data, error } = await admin.rpc("create_shop_with_branch", {
    p_user_id:        user.id,
    p_shop_name:      shopName.trim(),
    p_shop_type:      shopType ?? "general",
    p_currency:       normalizedCurrency,
    p_country:        normalizedCountry,
    p_timezone:       normalizedTimezone,
    p_branch_name:    branchName.trim(),
    p_branch_address: branchAddress?.trim() || null,
    p_plan_id:        resolvedPlanId,
  })

  if (error) {
    console.error("[onboarding] RPC error:", error)
    if (error.message?.includes("already belongs")) {
      return NextResponse.json({ error: "You already have an active shop" }, { status: 400 })
    }
    return NextResponse.json({ error: "Setup failed. Please try again." }, { status: 500 })
  }

  const result = data as { shop_id: string; branch_id: string }
  return NextResponse.json({ success: true, shop_id: result.shop_id, branch_id: result.branch_id })
}
