"use client"

import { createContext, useContext } from "react"
import type { Branch } from "@/types"

interface BranchContextType {
  branches: Branch[]
  selectedBranchId: string | null // null = "All Branches"
  setSelectedBranchId: (id: string | null) => void
  selectedBranch: Branch | null
}

export const BranchCtx = createContext<BranchContextType>({
  branches: [],
  selectedBranchId: null,
  setSelectedBranchId: () => {},
  selectedBranch: null,
})

export function useBranch(): BranchContextType {
  return useContext(BranchCtx)
}
