"use client"

import { createContext, useContext } from "react"
import type { SessionContext } from "@/types"

export const SessionCtx = createContext<SessionContext | null>(null)

export function useSession(): SessionContext {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}
