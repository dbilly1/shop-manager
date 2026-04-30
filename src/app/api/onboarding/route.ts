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

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when the Supabase error means the RPC function doesn't exist in the DB yet. */
function isRpcNotFound(err: { code?: string; message?: string }) {
  return (
    err.code === "PGRST202" ||
    err.message?.toLowerCase().includes("could not find the function") ||
    err.message?.toLowerCase().includes("does not exist")
  )
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

  // ── Resolve plan id ───────────────────────────────────────────────────────
  // Only query if planId looks like a real UUID — fallback strings ("free" etc.)
  // from the client-side hardcoded list are not UUIDs and would error in Postgres.
  let resolvedPlanId: string | null = null
  if (planId && UUID_RE.test(planId)) {
    const { data: chosenPlan } = await admin
      .from("plans")
      .select("id")
      .eq("id", planId)
      .eq("is_active", true)
      .single()
    resolvedPlanId = chosenPlan?.id ?? null
  }
  // Always fall back to the Free plan if nothing resolved
  if (!resolvedPlanId) {
    const { data: freePlan } = await admin
      .from("plans")
      .select("id")
      .eq("name", "Free")
      .single()
    resolvedPlanId = freePlan?.id ?? null
  }

  // ── Attempt atomic creation via RPC ──────────────────────────────────────
  const { data: rpcData, error: rpcError } = await admin.rpc("create_shop_with_branch", {
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

  if (!rpcError) {
    // Happy path — RPC succeeded
    const result = rpcData as { shop_id: string; branch_id: string }
    return NextResponse.json({ success: true, shop_id: result.shop_id, branch_id: result.branch_id })
  }

  // ── RPC not available (migration 011 not yet applied) → sequential fallback ─
  if (isRpcNotFound(rpcError)) {
    console.warn("[onboarding] create_shop_with_branch RPC not found — falling back to sequential inserts. Run migration 011.")
    return sequentialCreate({ admin, user, shopName, shopType, normalizedCurrency, normalizedCountry, normalizedTimezone, branchName, branchAddress, resolvedPlanId })
  }

  // ── Any other RPC error ───────────────────────────────────────────────────
  console.error("[onboarding] RPC error:", rpcError)

  if (rpcError.message?.includes("already belongs")) {
    return NextResponse.json({ error: "You already have an active shop" }, { status: 400 })
  }

  return NextResponse.json(
    { error: "Setup failed. Please try again.", code: rpcError.code ?? null },
    { status: 500 },
  )
}

// ── Sequential fallback (pre-migration 011 behaviour) ────────────────────────
async function sequentialCreate(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
  user: { id: string }
  shopName: string
  shopType: string
  normalizedCurrency: string
  normalizedCountry: string
  normalizedTimezone: string
  branchName: string
  branchAddress: string
  resolvedPlanId: string | null
}): Promise<NextResponse> {
  const {
    admin, user, shopName, shopType,
    normalizedCurrency, normalizedCountry, normalizedTimezone,
    branchName, branchAddress, resolvedPlanId,
  } = params

  // Guard: no duplicate shop
  const { data: existing } = await admin
    .from("shop_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()
  if (existing) {
    return NextResponse.json({ error: "You already have an active shop" }, { status: 400 })
  }

  // Create shop
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .insert({
      name:     shopName.trim(),
      type:     shopType ?? "general",
      owner_id: user.id,
      plan_id:  resolvedPlanId,
      currency: normalizedCurrency,
      country:  normalizedCountry,
      timezone: normalizedTimezone,
    })
    .select()
    .single()
  if (shopError || !shop) {
    return NextResponse.json({ error: shopError?.message ?? "Failed to create shop" }, { status: 500 })
  }

  // Create branch
  const { data: branch, error: branchError } = await admin
    .from("branches")
    .insert({
      shop_id: shop.id,
      name:    branchName.trim(),
      address: branchAddress?.trim() || null,
    })
    .select()
    .single()
  if (branchError || !branch) {
    return NextResponse.json({ error: branchError?.message ?? "Failed to create branch" }, { status: 500 })
  }

  // Create owner membership
  const { error: memberError } = await admin.from("shop_members").insert({
    shop_id:   shop.id,
    branch_id: null,
    user_id:   user.id,
    role:      "owner",
    status:    "active",
  })
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Create subscription
  if (resolvedPlanId) {
    await admin.from("shop_subscriptions").insert({
      shop_id: shop.id,
      plan_id: resolvedPlanId,
      status:  "active",
    })
  }

  return NextResponse.json({ success: true, shop_id: shop.id, branch_id: branch.id })
}
