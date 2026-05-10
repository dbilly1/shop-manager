/**
 * Canonical permission definitions for the RBAC system.
 *
 * PERMISSION_DEFS  — all configurable permissions with UI metadata
 * BASE_ROLE_DEFAULTS — the hardcoded starting point for each base role.
 *   These are the effective permissions when no shop customisation exists.
 *   They exactly mirror the hardcoded arrays in permissions.ts.
 *
 * NOT configurable (always owner-only, never shown in the UI):
 *   canManageShopSettings, canManageBilling
 */

// ─── Permission keys ──────────────────────────────────────────────────────────

export const PERMISSION_KEYS = [
  // Sales
  "canBackdateSales",
  "canDeleteSale",
  // Inventory
  "canManageInventory",
  "canManageStockAudits",
  "canInitiateTransfers",
  "canApproveTransfers",
  // Finance
  "canManageExpenses",
  "canManageCredit",
  "canAutoApproveAdjustments",
  "canApproveAdjustments",
  // Reports & Data
  "canViewReports",
  "canViewAuditLog",
  "canViewHistory",
  "canAccessConsolidatedView",
  // Team
  "canManageStaff",
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]
export type PermissionGroup = "Sales" | "Inventory" | "Finance" | "Reports & Data" | "Team"
export type RoleDefaults = Record<PermissionKey, boolean>

// ─── UI metadata ──────────────────────────────────────────────────────────────

export interface PermissionDef {
  key: PermissionKey
  label: string
  description: string
  group: PermissionGroup
}

export const PERMISSION_DEFS: PermissionDef[] = [
  // Sales
  {
    key: "canBackdateSales",
    label: "Backdate sales",
    description: "Record sales on past dates",
    group: "Sales",
  },
  {
    key: "canDeleteSale",
    label: "Delete sales",
    description: "Permanently remove sale records",
    group: "Sales",
  },
  // Inventory
  {
    key: "canManageInventory",
    label: "Manage inventory",
    description: "Add and edit products, restock",
    group: "Inventory",
  },
  {
    key: "canManageStockAudits",
    label: "Run stock audits",
    description: "Create and complete stock counts",
    group: "Inventory",
  },
  {
    key: "canInitiateTransfers",
    label: "Initiate transfers",
    description: "Request stock transfers between branches",
    group: "Inventory",
  },
  {
    key: "canApproveTransfers",
    label: "Approve transfers",
    description: "Approve or reject transfer requests",
    group: "Inventory",
  },
  // Finance
  {
    key: "canManageExpenses",
    label: "Manage expenses",
    description: "Add and edit expense records",
    group: "Finance",
  },
  {
    key: "canManageCredit",
    label: "Manage credit",
    description: "Record credit sales and repayments",
    group: "Finance",
  },
  {
    key: "canAutoApproveAdjustments",
    label: "Auto-approve adjustments",
    description: "Stock adjustments take effect immediately without a second sign-off",
    group: "Finance",
  },
  {
    key: "canApproveAdjustments",
    label: "Approve adjustments",
    description: "Review and approve others' pending stock adjustments",
    group: "Finance",
  },
  // Reports & Data
  {
    key: "canViewReports",
    label: "View reports",
    description: "Access the reports page",
    group: "Reports & Data",
  },
  {
    key: "canViewAuditLog",
    label: "View audit log",
    description: "See the full activity trail",
    group: "Reports & Data",
  },
  {
    key: "canViewHistory",
    label: "View history",
    description: "See inventory and restock history",
    group: "Reports & Data",
  },
  {
    key: "canAccessConsolidatedView",
    label: "Consolidated view",
    description: "View aggregated data across all branches",
    group: "Reports & Data",
  },
  // Team
  {
    key: "canManageStaff",
    label: "Manage staff",
    description: "Invite and deactivate team members",
    group: "Team",
  },
]

// ─── Base role defaults ───────────────────────────────────────────────────────
// These mirror the hardcoded arrays in permissions.ts exactly.
// When a shop has no customisation, these are the effective permissions.

export const BASE_ROLE_DEFAULTS: Record<string, RoleDefaults> = {
  owner: {
    canBackdateSales: true,
    canDeleteSale: true,
    canManageInventory: true,
    canManageStockAudits: true,
    canInitiateTransfers: true,
    canApproveTransfers: true,
    canManageExpenses: true,
    canManageCredit: true,
    canAutoApproveAdjustments: true,
    canApproveAdjustments: true,
    canViewReports: true,
    canViewAuditLog: true,
    canViewHistory: true,
    canAccessConsolidatedView: true,
    canManageStaff: true,
  },
  general_manager: {
    canBackdateSales: true,
    canDeleteSale: true,
    canManageInventory: true,
    canManageStockAudits: true,
    canInitiateTransfers: true,
    canApproveTransfers: true,
    canManageExpenses: true,
    canManageCredit: true,
    canAutoApproveAdjustments: true,
    canApproveAdjustments: true,
    canViewReports: true,
    canViewAuditLog: true,
    canViewHistory: true,
    canAccessConsolidatedView: true,
    canManageStaff: true,
  },
  general_supervisor: {
    canBackdateSales: false,
    canDeleteSale: false,
    canManageInventory: true,
    canManageStockAudits: true,
    canInitiateTransfers: true,
    canApproveTransfers: false,
    canManageExpenses: true,
    canManageCredit: true,
    canAutoApproveAdjustments: false,
    canApproveAdjustments: false,
    canViewReports: true,
    canViewAuditLog: true,
    canViewHistory: true,
    canAccessConsolidatedView: true,
    canManageStaff: false,
  },
  branch_manager: {
    canBackdateSales: true,
    canDeleteSale: true,
    canManageInventory: true,
    canManageStockAudits: true,
    canInitiateTransfers: true,
    canApproveTransfers: false,
    canManageExpenses: true,
    canManageCredit: true,
    canAutoApproveAdjustments: false,
    canApproveAdjustments: false,
    canViewReports: true,
    canViewAuditLog: true,
    canViewHistory: true,
    canAccessConsolidatedView: false,
    canManageStaff: true,
  },
  branch_supervisor: {
    canBackdateSales: false,
    canDeleteSale: false,
    canManageInventory: false,
    canManageStockAudits: false,
    canInitiateTransfers: false,
    canApproveTransfers: false,
    canManageExpenses: false,
    canManageCredit: true,
    canAutoApproveAdjustments: false,
    canApproveAdjustments: false,
    canViewReports: true,
    canViewAuditLog: false,
    canViewHistory: true,
    canAccessConsolidatedView: false,
    canManageStaff: false,
  },
  salesperson: {
    canBackdateSales: false,
    canDeleteSale: false,
    canManageInventory: false,
    canManageStockAudits: false,
    canInitiateTransfers: false,
    canApproveTransfers: false,
    canManageExpenses: false,
    canManageCredit: true,
    canAutoApproveAdjustments: false,
    canApproveAdjustments: false,
    canViewReports: false,
    canViewAuditLog: false,
    canViewHistory: true,
    canAccessConsolidatedView: false,
    canManageStaff: false,
  },
}

// Convenience: all-false set for unknown/null roles
export const NO_PERMISSIONS: RoleDefaults = Object.fromEntries(
  PERMISSION_KEYS.map((k) => [k, false])
) as RoleDefaults
