import { cookies } from "next/headers"

/**
 * Returns the effective branch ID for server-side queries.
 *
 * - Branch-scoped users always get their own fixed branch_id.
 * - Shop-level users get whatever the topnav stored in `sm_branch`
 *   (set client-side; travels with every HTTP request).
 * - Returns null when the user is in "All Branches" mode.
 */
export async function getActiveBranchId(
  sessionBranchId: string | null | undefined,
): Promise<string | null> {
  if (sessionBranchId) return sessionBranchId
  const store = await cookies()
  return store.get("sm_branch")?.value || null
}
