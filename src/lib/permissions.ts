import type { Role } from "@/types"

export function canAccessConsolidatedView(role: Role): boolean {
  return ["owner", "general_manager", "general_supervisor"].includes(role)
}

export function canManageStaff(role: Role): boolean {
  return ["owner", "general_manager", "branch_manager"].includes(role)
}

export function canManageBilling(role: Role): boolean {
  return role === "owner"
}

export function canAutoApproveAdjustments(role: Role): boolean {
  // Owner and GM adjustments take effect immediately — no second sign-off needed
  return ["owner", "general_manager"].includes(role)
}

export function canApproveAdjustments(role: Role): boolean {
  // Only owner and GM can approve others' pending adjustments
  return ["owner", "general_manager"].includes(role)
}

export function canBackdateSales(role: Role): boolean {
  return ["owner", "general_manager", "branch_manager"].includes(role)
}

export function canManageInventory(role: Role): boolean {
  return ["owner", "general_manager", "general_supervisor", "branch_manager"].includes(role)
}

export function canViewReports(role: Role): boolean {
  return ["owner", "general_manager", "general_supervisor", "branch_manager", "branch_supervisor"].includes(role)
}

export function canManageExpenses(role: Role): boolean {
  return ["owner", "general_manager", "general_supervisor", "branch_manager"].includes(role)
}

export function canManageCredit(role: Role): boolean {
  return ["owner", "general_manager", "general_supervisor", "branch_manager", "branch_supervisor"].includes(role)
}

export function canInitiateTransfers(role: Role): boolean {
  return ["owner", "general_manager", "general_supervisor", "branch_manager"].includes(role)
}

export function canApproveTransfers(role: Role): boolean {
  return ["owner", "general_manager"].includes(role)
}

export function canViewAuditLog(role: Role): boolean {
  return ["owner", "general_manager", "general_supervisor", "branch_manager"].includes(role)
}

export function canManageShopSettings(role: Role): boolean {
  return role === "owner"
}
