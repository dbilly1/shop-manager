"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Sidebar } from "@/components/layout/sidebar"
import { TopNav } from "@/components/layout/topnav"
import { AnnouncementBanner } from "@/components/shared/announcement-banner"
import { SessionCtx } from "@/hooks/useSession"
import { BranchCtx } from "@/hooks/useBranch"
import { Toaster } from "@/components/ui/sonner"
import type { SessionContext, Branch, Shop, Announcement } from "@/types"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [session, setSession] = useState<SessionContext | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Check super admin
      const { data: superAdmin } = await supabase
        .from("super_admins")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (superAdmin) {
        router.push("/admin/dashboard")
        return
      }

      // Get membership
      const { data: member } = await supabase
        .from("shop_members")
        .select("shop_id, branch_id, role")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single()

      if (!member) {
        router.push("/onboarding")
        return
      }

      const ctx: SessionContext = {
        user_id: user.id,
        shop_id: member.shop_id,
        branch_id: member.branch_id,
        role: member.role as SessionContext["role"],
        is_super_admin: false,
        full_name: user.user_metadata?.full_name ?? null,
      }
      setSession(ctx)

      // Get shop
      const { data: shopData } = await supabase
        .from("shops")
        .select("*")
        .eq("id", member.shop_id)
        .single()
      setShop(shopData)

      // Get branches
      const { data: branchData } = await supabase
        .from("branches")
        .select("*")
        .eq("shop_id", member.shop_id)
        .eq("status", "active")
        .order("name")
      setBranches(branchData ?? [])

      // For branch-level roles, pre-select their branch
      if (member.branch_id) {
        setSelectedBranchId(member.branch_id)
      }

      // Load active announcements
      const now = new Date().toISOString()
      const { data: annData } = await supabase
        .from("announcements")
        .select("*")
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("starts_at", { ascending: false })
      setAnnouncements(annData ?? [])

      setLoading(false)
    }
    load()
  }, [router])

  // Apply shop primary colour as CSS variables
  useEffect(() => {
    const colour = shop?.primary_colour
    if (!colour || colour === "#000000") return
    const ri = parseInt(colour.slice(1, 3), 16)
    const gi = parseInt(colour.slice(3, 5), 16)
    const bi = parseInt(colour.slice(5, 7), 16)
    const dr = Math.max(0, Math.round(ri * 0.6))
    const dg = Math.max(0, Math.round(gi * 0.6))
    const db = Math.max(0, Math.round(bi * 0.6))

    // Compute HSL for primary variable
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
    root.style.setProperty("--shop-primary", `${ri} ${gi} ${bi}`)
    root.style.setProperty("--shop-primary-dark", `${dr} ${dg} ${db}`)
    root.style.setProperty("--primary", `hsl(${hDeg} ${sPct}% 40%)`)
    root.style.setProperty("--primary-foreground", "oklch(1 0 0)")
    root.style.setProperty("--ring", `hsl(${hDeg} ${sPct}% 40%)`)
    return () => {
      root.style.removeProperty("--shop-primary")
      root.style.removeProperty("--shop-primary-dark")
      root.style.removeProperty("--primary")
      root.style.removeProperty("--primary-foreground")
      root.style.removeProperty("--ring")
    }
  }, [shop?.primary_colour])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return null

  const userName = shop?.name ?? "Shop"
  const userEmail = ""
  const shopColour = shop?.primary_colour && shop.primary_colour !== "#000000" ? shop.primary_colour : null

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null

  return (
    <SessionCtx.Provider value={session}>
      <BranchCtx.Provider value={{ branches, selectedBranchId, setSelectedBranchId, selectedBranch }}>
        <div className="flex min-h-screen bg-background">
          <Sidebar shopName={shop?.name ?? "ShopManager"} shopLogo={shop?.logo_url} shopColour={shopColour} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopNav userEmail={userEmail} userName={session.user_id.slice(0, 6)} />
            <AnnouncementBanner announcements={announcements} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {children}
            </main>
          </div>
        </div>
        <Toaster position="top-right" richColors />
      </BranchCtx.Provider>
    </SessionCtx.Provider>
  )
}
