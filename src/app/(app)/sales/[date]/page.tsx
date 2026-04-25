import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { SaleDayClient } from "./sale-day-client"
import { getActiveBranchId } from "@/lib/branch-cookie"

export default async function SaleDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  const query = supabase
    .from("sales")
    .select("*, sale_items(*, product:products(name, unit_type)), customer:customers(name)")
    .eq("shop_id", session.shop_id!)
    .eq("sale_date", date)
    .order("created_at", { ascending: false })

  if (activeBranchId) query.eq("branch_id", activeBranchId)

  const { data: sales } = await query
  const { data: shop } = await supabase.from("shops").select("currency").eq("id", session.shop_id!).single()

  return (
    <SaleDayClient
      date={date}
      sales={sales ?? []}
      currency={shop?.currency ?? "USD"}
      session={session}
    />
  )
}
