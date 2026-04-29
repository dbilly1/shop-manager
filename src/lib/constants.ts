// ─── Time / dates ─────────────────────────────────────────────────────────────
export const SALES_HISTORY_DAYS = 90
export const RECENT_EXPENSES_LIMIT = 200
export const RECENT_ADJUSTMENTS_LIMIT = 200
export const RECENT_AUDIT_LIMIT = 500

// ─── Invite ───────────────────────────────────────────────────────────────────
export const INVITE_EXPIRY_HOURS = 72
export const INVITE_EXPIRY_MS = INVITE_EXPIRY_HOURS * 60 * 60 * 1000

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const MIN_PASSWORD_LENGTH = 8
export const TEMP_PASSWORD_LENGTH = 10

// ─── Defaults ─────────────────────────────────────────────────────────────────
export const DEFAULT_CURRENCY = "USD"
export const DEFAULT_PLAN_USER_LIMIT = 10

// ─── Pagination ───────────────────────────────────────────────────────────────
export const SUPABASE_AUTH_LIST_PAGE_SIZE = 1000

// ─── ISO currency codes (validated against shops.currency) ────────────────────
export const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "NGN", "GHS", "KES", "ZAR",
  "INR", "AUD", "CAD", "JPY", "CNY", "AED", "EGP",
] as const

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]

export function isValidCurrency(c: string): c is CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(c as CurrencyCode)
}
