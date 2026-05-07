"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { TopNav } from "@/components/layout/topnav"
import { AnnouncementBanner } from "@/components/shared/announcement-banner"
import { SessionCtx } from "@/hooks/useSession"
import { BranchCtx } from "@/hooks/useBranch"
import { Toaster } from "@/components/ui/sonner"
import { IdleTimeoutDialog } from "@/components/shared/idle-timeout-dialog"
import type { SessionContext, Branch, Shop, Announcement } from "@/types"

interface Props {
  session: SessionContext
  shop: Shop | null
  branches: Branch[]
  announcements: Announcement[]
  initialSelectedBranchId: string | null
  userEmail: string
  children: React.ReactNode
}

export function AppShell({
  session,
  shop,
  branches,
  announcements,
  initialSelectedBranchId,
  userEmail,
  children,
}: Props) {
  const router = useRouter()
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    initialSelectedBranchId
  )

  // Apply shop primary colour as CSS variables
  useEffect(() => {
    const colour = shop?.primary_colour
    if (!colour || colour === "#1b1a19") return
    const ri = parseInt(colour.slice(1, 3), 16)
    const gi = parseInt(colour.slice(3, 5), 16)
    const bi = parseInt(colour.slice(5, 7), 16)
    const dr = Math.max(0, Math.round(ri * 0.6))
    const dg = Math.max(0, Math.round(gi * 0.6))
    const db = Math.max(0, Math.round(bi * 0.6))

    const r = ri / 255, g = gi / 255, b = bi / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const lum = (max + min) / 2
    let h = 0, s = 0
    if (max !== min) {
      const d = max - min
      s = lum > 0.5 ? d / (2 - max - min) : d / (max + min)
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      else if (max === g) h = ((b - r) / d + 2) / 6
      else h = ((r - g) / d + 4) / 6
    }
    const hDeg = Math.round(h * 360)
    const sPct = Math.round(s * 100)

    const root = document.documentElement
    const tintS = Math.min(Math.round(sPct * 0.4), 30)
    root.style.setProperty("--shop-primary", `${ri} ${gi} ${bi}`)
    root.style.setProperty("--shop-primary-dark", `${dr} ${dg} ${db}`)
    root.style.setProperty("--primary", `hsl(${hDeg} ${sPct}% 40%)`)
    root.style.setProperty("--primary-foreground", "oklch(1 0 0)")
    root.style.setProperty("--ring", `hsl(${hDeg} ${sPct}% 40%)`)

    const styleTag = document.createElement("style")
    styleTag.id = "brand-bg"
    styleTag.textContent = `
      :root { --background: hsl(${hDeg} ${tintS}% 97.5%); }
      .dark  { --background: hsl(${hDeg} ${tintS}% 7%); }
    `
    document.head.appendChild(styleTag)

    return () => {
      root.style.removeProperty("--shop-primary")
      root.style.removeProperty("--shop-primary-dark")
      root.style.removeProperty("--primary")
      root.style.removeProperty("--primary-foreground")
      root.style.removeProperty("--ring")
      document.getElementById("brand-bg")?.remove()
    }
  }, [shop?.primary_colour])

  // Branch switch: write cookie, soft-refresh server data
  function handleSetBranch(id: string | null) {
    setSelectedBranchId(id)
    if (id) {
      document.cookie = `sm_branch=${id}; path=/; SameSite=Lax`
    } else {
      document.cookie = `sm_branch=; path=/; max-age=0; SameSite=Lax`
    }
    router.refresh()
  }

  const shopColour =
    shop?.primary_colour && shop.primary_colour !== "#1b1a19" ? shop.primary_colour : null
  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null

  return (
    <SessionCtx.Provider value={session}>
      <BranchCtx.Provider
        value={{ branches, selectedBranchId, setSelectedBranchId: handleSetBranch, selectedBranch }}
      >
        <div className="flex h-screen bg-background">
          <Sidebar shopName={shop?.name ?? "ShopManager"} shopLogo={shop?.logo_url} shopColour={shopColour} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopNav userEmail={userEmail} userName={session.full_name ?? userEmail.split("@")[0] ?? "User"} />
            <AnnouncementBanner announcements={announcements} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </div>
        <Toaster position="top-right" richColors />
        <IdleTimeoutDialog />
      </BranchCtx.Provider>
    </SessionCtx.Provider>
  )
}
