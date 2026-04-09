export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    typeof date === "string" ? new Date(date) : date
  )
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof date === "string" ? new Date(date) : date)
}

export function formatRole(role: string): string {
  const map: Record<string, string> = {
    owner: "Owner",
    general_manager: "General Manager",
    general_supervisor: "General Supervisor",
    branch_manager: "Branch Manager",
    branch_supervisor: "Branch Supervisor",
    salesperson: "Salesperson",
    super_admin: "Super Admin",
  }
  return map[role] ?? role
}

export function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    cash: "Cash",
    mobile: "Mobile Money",
    credit: "Credit",
  }
  return map[method] ?? method
}

export function formatAdjustmentReason(reason: string): string {
  const map: Record<string, string> = {
    damage_spoilage: "Damage / Spoilage",
    theft: "Theft",
    recount_correction: "Recount Correction",
    purchase_receiving: "Purchase Receiving",
    return_to_supplier: "Return to Supplier",
    handling_loss: "Handling Loss",
    melt_loss: "Melt Loss",
    other: "Other",
  }
  return map[reason] ?? reason
}

export function getStockQty(bp: {
  current_stock_kg: number
  current_stock_units: number
  current_stock_boxes: number
  product?: { unit_type: string }
}): number {
  if (!bp.product) return bp.current_stock_units
  switch (bp.product.unit_type) {
    case "kg": return bp.current_stock_kg
    case "boxes": return bp.current_stock_boxes
    default: return bp.current_stock_units
  }
}
