export type Role =
  | "super_admin"
  | "owner"
  | "general_manager"
  | "general_supervisor"
  | "branch_manager"
  | "branch_supervisor"
  | "salesperson"

export type ShopType =
  | "cold_store"
  | "pharmacy"
  | "hardware"
  | "boutique"
  | "general"
  | "other"

export type PricingMode = "uniform" | "branch"

export type MemberStatus = "active" | "pending" | "deactivated"

export type PaymentMethod = "cash" | "mobile" | "credit"

export type UnitType = "kg" | "units"

export type AdjustmentReason =
  | "damage_spoilage"
  | "theft"
  | "recount_correction"
  | "purchase_receiving"
  | "return_to_supplier"
  | "handling_loss"
  | "melt_loss"
  | "other"

export type AdjustmentStatus = "pending" | "approved" | "rejected"

export type TransferStatus = "pending" | "approved" | "rejected" | "cancelled"

export type ReconciliationStatus = "balanced" | "flagged"

export type AlertType =
  | "low_stock"
  | "critical_stock"
  | "large_credit_balance"
  | "reconciliation_flagged"
  | "adjustment_pending"

export type AlertStatus = "open" | "acknowledged" | "resolved"

export type ShopStatus = "active" | "inactive" | "suspended"

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "trialing"

// ─── Database Row Types ─────────────────────────────────────────────────────

export interface Shop {
  id: string
  name: string
  type: ShopType
  owner_id: string
  plan_id: string
  status: ShopStatus
  currency: string
  country: string
  timezone: string
  logo_url: string | null
  primary_colour: string
  secondary_colour: string
  pricing_mode: PricingMode
  recon_tolerance: number
  credit_overdue_days: number
  created_at: string
}

export interface Plan {
  id: string
  name: string
  price_monthly: number
  price_annual: number
  max_branches: number
  max_users: number
  max_products: number
  max_customers: number
  data_retention_months: number
  feature_flags: Record<string, boolean>
  is_active: boolean
  created_at: string
}

export interface ShopSubscription {
  id: string
  shop_id: string
  plan_id: string
  stripe_subscription_id: string | null
  status: SubscriptionStatus
  current_period_end: string
  created_at: string
}

export interface Branch {
  id: string
  shop_id: string
  name: string
  address: string | null
  status: "active" | "inactive"
  created_at: string
}

export interface ShopMember {
  id: string
  shop_id: string
  branch_id: string | null
  user_id: string
  role: Role
  invited_by: string | null
  status: MemberStatus
  created_at: string
}

export interface ShopInvite {
  id: string
  shop_id: string
  branch_id: string | null
  email: string
  role: Role
  token: string
  expires_at: string
  accepted_at: string | null
  invited_by: string
  created_at: string
}

export interface Product {
  id: string
  shop_id: string
  name: string
  sku: string | null
  category: string | null
  unit_type: UnitType
  units_per_box: number | null  // how many primary units (kg or pieces) per box; null = no box tracking
  base_price: number
  cost_price: number
  reorder_threshold: number
  is_active: boolean
  created_at: string
}

export interface BranchProduct {
  id: string
  shop_id: string
  branch_id: string
  product_id: string
  is_active: boolean
  override_price: number | null
  current_stock_kg: number
  current_stock_units: number
  current_stock_boxes: number
  updated_at: string
  product?: Product
}

export interface Customer {
  id: string
  shop_id: string
  branch_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  credit_limit: number
  created_at: string
}

export interface Sale {
  id: string
  shop_id: string
  branch_id: string
  sale_date: string
  total_amount: number
  payment_method: PaymentMethod
  customer_id: string | null
  recorded_by: string
  created_at: string
  sale_items?: SaleItem[]
  customer?: Customer
}

export interface SaleItem {
  id: string
  sale_id: string
  shop_id: string
  branch_id: string
  product_id: string
  quantity_kg: number
  quantity_units: number
  quantity_boxes: number
  unit_price: number
  discount_amount: number
  line_total: number
  cost_price_at_sale: number
  product?: Product
}

export interface Expense {
  id: string
  shop_id: string
  branch_id: string
  expense_date: string
  amount: number
  category: string
  description: string | null
  payment_method: "cash" | "mobile"
  batch_id: string | null
  recorded_by: string
  recorded_by_name: string | null
  created_at: string
}

export interface StockAdjustment {
  id: string
  shop_id: string
  branch_id: string
  product_id: string
  adjustment_type: "increase" | "decrease"
  quantity: number
  reason: AdjustmentReason
  notes: string | null
  adjusted_by: string
  approved_by: string | null
  status: AdjustmentStatus
  created_at: string
  product?: Product
}

export interface StockTransfer {
  id: string
  shop_id: string
  from_branch_id: string
  to_branch_id: string
  product_id: string
  quantity: number
  reason: string | null
  notes: string | null
  requested_by: string
  approved_by: string | null
  status: TransferStatus
  created_at: string
  product?: Product
  from_branch?: Branch
  to_branch?: Branch
}

export interface CreditSale {
  id: string
  shop_id: string
  branch_id: string
  sale_id: string
  customer_id: string
  amount_owed: number
  amount_paid: number
  balance: number
  created_at: string
  customer?: Customer
  sale?: Sale
}

export interface CreditPayment {
  id: string
  shop_id: string
  branch_id: string
  customer_id: string
  amount: number
  payment_method: "cash" | "mobile"
  payment_date: string
  recorded_by: string
  created_at: string
}

export interface Reconciliation {
  id: string
  shop_id: string
  branch_id: string
  reconciliation_date: string
  recorded_by: string
  expected_cash: number
  actual_cash: number
  cash_variance: number
  expected_mobile: number
  actual_mobile: number
  mobile_variance: number
  status: ReconciliationStatus
  notes: string | null
  created_at: string
}

export interface Alert {
  id: string
  shop_id: string
  branch_id: string | null
  type: AlertType
  message: string
  entity_id: string | null
  entity_type: string | null
  status: AlertStatus
  created_at: string
  branch?: Branch
}

export interface AuditLog {
  id: string
  shop_id: string
  branch_id: string | null
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  starts_at: string
  ends_at: string | null
  created_by: string
  created_at: string
}

export interface SuperAdmin {
  id: string
  user_id: string
  created_at: string
}

// ─── Session / Context Types ─────────────────────────────────────────────────

export interface SessionContext {
  user_id: string
  full_name: string | null
  shop_id: string | null
  branch_id: string | null
  role: Role | null
  is_super_admin: boolean
}

// ─── UI / helper types ───────────────────────────────────────────────────────

export interface DailySalesSummary {
  sale_date: string
  total_sales: number
  cash: number
  mobile: number
  credit: number
  transaction_count: number
}

export interface BranchMetrics {
  branch_id: string
  branch_name: string
  total_revenue: number
  total_expenses: number
  net_profit: number
  outstanding_credit: number
}
