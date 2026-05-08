import { createClient } from "@/lib/supabase/server"

export type FeatureFlags = {
  advanced_reports?: boolean
  stock_transfers?: boolean
  audit_log?: boolean
  api_access?: boolean
  custom_branding?: boolean
  [key: string]: boolean | undefined
}

export type PlanInfo = {
  max_branches: number
  max_users: number
  max_products: number
  max_customers: number
  feature_flags: FeatureFlags
}

/**
 * Fetch the active plan limits for a shop.
 * Returns null if no subscription/plan is found.
 */
export async function getPlanForShop(shopId: string): Promise<PlanInfo | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("shop_subscriptions")
    .select("plan:plans(max_branches, max_users, max_products, max_customers, feature_flags)")
    .eq("shop_id", shopId)
    .single()

  if (!data?.plan) return null
  const p = data.plan as unknown as Record<string, unknown>
  return {
    max_branches: p.max_branches as number,
    max_users: p.max_users as number,
    max_products: p.max_products as number,
    max_customers: p.max_customers as number,
    feature_flags: ((p.feature_flags ?? {}) as FeatureFlags),
  }
}

/**
 * Returns true if the feature is enabled on the plan.
 * Defaults to true when plan is null or the flag key is absent — safe during
 * transition so existing users aren't locked out if the DB hasn't been configured.
 * Only an explicit `false` value in feature_flags will block access.
 */
export function hasFeature(plan: PlanInfo | null, flag: keyof FeatureFlags): boolean {
  if (!plan) return true
  const val = plan.feature_flags[flag]
  return val !== false
}

/**
 * Returns true if adding one more resource would exceed the plan limit.
 */
export function isAtLimit(
  plan: PlanInfo | null,
  resource: "branches" | "users" | "products" | "customers",
  currentCount: number,
): boolean {
  if (!plan) return false
  const limits: Record<string, number> = {
    branches: plan.max_branches,
    users: plan.max_users,
    products: plan.max_products,
    customers: plan.max_customers,
  }
  return currentCount >= limits[resource]
}
