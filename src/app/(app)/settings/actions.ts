"use server"

import { getSessionContext } from "@/lib/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { logAudit } from "@/lib/audit"

// ─── Shared guard ─────────────────────────────────────────────────────────────

async function requireOwner(shopId: string) {
  const session = await getSessionContext()
  if (!session || session.role !== "owner" || session.shop_id !== shopId) {
    throw new Error("Unauthorized — only the shop owner can perform this action.")
  }
  return session
}

// ─── Transactional Reset ──────────────────────────────────────────────────────
// Deletes all operational records for the shop.
// Preserved: shop settings, branches, staff, products, customers, audit log.
// Stock levels on branch_products are reset to zero.

export async function transactionalReset(shopId: string) {
  const session = await requireOwner(shopId)
  const admin = createAdminClient()

  // 1. Stock audits (items first, then header)
  const { data: auditIds } = await admin
    .from("stock_audits")
    .select("id")
    .eq("shop_id", shopId)
  if (auditIds?.length) {
    const ids = auditIds.map((r) => r.id)
    await admin.from("stock_audit_items").delete().in("audit_id", ids)
  }
  await admin.from("stock_audits").delete().eq("shop_id", shopId)

  // 2. Credit (payments before sales to respect FK)
  await admin.from("credit_payments").delete().eq("shop_id", shopId)
  await admin.from("credit_sales").delete().eq("shop_id", shopId)

  // 3. Sales (sale_items cascade automatically)
  await admin.from("sales").delete().eq("shop_id", shopId)

  // 4. Other operational tables
  await admin.from("reconciliations").delete().eq("shop_id", shopId)
  await admin.from("expenses").delete().eq("shop_id", shopId)
  await admin.from("stock_adjustments").delete().eq("shop_id", shopId)
  await admin.from("restocks").delete().eq("shop_id", shopId)
  await admin.from("stock_transfers").delete().eq("shop_id", shopId)

  // 5. Reset all stock levels to zero
  await admin
    .from("branch_products")
    .update({ current_stock_kg: 0, current_stock_units: 0, current_stock_boxes: 0 })
    .eq("shop_id", shopId)

  // 6. Audit entry (kept intentionally)
  await logAudit({
    shopId,
    userId: session.user_id,
    action: "TRANSACTIONAL_RESET",
    entityType: "shop",
    entityId: shopId,
    newValues: { note: "Transactional reset performed by owner" },
  })
}

// ─── Full Reset ───────────────────────────────────────────────────────────────
// Clears everything except the shop record, branches, staff, and products.
// Stock levels reset to zero. Audit log is wiped entirely.
// The shop is returned to the state it was in immediately after initial setup.

export async function fullReset(shopId: string) {
  await requireOwner(shopId)
  const admin = createAdminClient()

  // 1. Stock audits
  const { data: auditIds } = await admin
    .from("stock_audits")
    .select("id")
    .eq("shop_id", shopId)
  if (auditIds?.length) {
    const ids = auditIds.map((r) => r.id)
    await admin.from("stock_audit_items").delete().in("audit_id", ids)
  }
  await admin.from("stock_audits").delete().eq("shop_id", shopId)

  // 2. Credit
  await admin.from("credit_payments").delete().eq("shop_id", shopId)
  await admin.from("credit_sales").delete().eq("shop_id", shopId)

  // 3. Sales
  await admin.from("sales").delete().eq("shop_id", shopId)

  // 4. Other operational
  await admin.from("reconciliations").delete().eq("shop_id", shopId)
  await admin.from("expenses").delete().eq("shop_id", shopId)
  await admin.from("stock_adjustments").delete().eq("shop_id", shopId)
  await admin.from("restocks").delete().eq("shop_id", shopId)
  await admin.from("stock_transfers").delete().eq("shop_id", shopId)

  // 5. Customers (full reset only)
  await admin.from("customers").delete().eq("shop_id", shopId)

  // 6. Reset stock levels
  await admin
    .from("branch_products")
    .update({ current_stock_kg: 0, current_stock_units: 0, current_stock_boxes: 0 })
    .eq("shop_id", shopId)

  // 7. Wipe audit log (no entry written — this is intentional for a clean slate)
  await admin.from("audit_log").delete().eq("shop_id", shopId)
}
