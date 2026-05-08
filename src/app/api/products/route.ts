import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-guard"
import { createClient } from "@/lib/supabase/server"
import { getPlanForShop, isAtLimit } from "@/lib/plan-guard"
import { logAudit } from "@/lib/audit"

export async function POST(request: Request) {
  // owner → branch_manager (mirrors canManageInventory)
  const session = await requireRole(["owner", "general_manager", "general_supervisor", "branch_manager"])
  if (session instanceof NextResponse) return session

  const body = await request.json()
  const {
    name,
    category,
    unit_type,
    units_per_box,
    base_price,
    cost_price,
    reorder_threshold,
    audit_threshold_pct,
    opening_qty,
    opening_boxes,
    branch_ids,
  } = body

  if (!name?.trim() || !base_price) {
    return NextResponse.json(
      { error: "Product name and selling price are required" },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const plan = await getPlanForShop(session.shop_id!)

  const { count } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)

  if (isAtLimit(plan, "products", count ?? 0)) {
    return NextResponse.json(
      {
        error: `Product limit reached (${count}/${plan?.max_products}). Upgrade your plan to add more products.`,
      },
      { status: 403 }
    )
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      shop_id: session.shop_id,
      name: name.trim(),
      category: category || null,
      unit_type: unit_type ?? "units",
      units_per_box: units_per_box ? parseFloat(units_per_box) : null,
      base_price: parseFloat(base_price),
      cost_price: parseFloat(cost_price) || 0,
      reorder_threshold: parseFloat(reorder_threshold) || 0,
      audit_threshold_pct: audit_threshold_pct ? parseFloat(audit_threshold_pct) : null,
      is_active: true,
    })
    .select()
    .single()

  if (productError || !product) {
    return NextResponse.json(
      { error: productError?.message ?? "Failed to create product" },
      { status: 500 }
    )
  }

  await logAudit({
    shopId: session.shop_id!,
    branchId: null,
    userId: session.user_id,
    action: "CREATE_PRODUCT",
    entityType: "product",
    entityId: product.id,
    newValues: { name: product.name, category: product.category, base_price: product.base_price },
  })

  // Create branch_products entries for the target branches
  const targetBranchIds: string[] = Array.isArray(branch_ids) ? branch_ids : []
  if (targetBranchIds.length > 0) {
    const upb = units_per_box ? parseFloat(units_per_box) : 0
    const qty = parseFloat(opening_qty) || 0
    const boxes = parseFloat(opening_boxes) || 0
    const totalPrimary = qty + (upb > 0 ? boxes * upb : 0)

    await supabase.from("branch_products").insert(
      targetBranchIds.map((bid) => ({
        shop_id: session.shop_id,
        branch_id: bid,
        product_id: product.id,
        is_active: true,
        current_stock_kg: unit_type === "kg" ? totalPrimary : 0,
        current_stock_units: unit_type === "units" ? totalPrimary : 0,
        current_stock_boxes: 0,
      }))
    )
  }

  return NextResponse.json(product, { status: 201 })
}
