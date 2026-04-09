import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { SaleDayClient } from "./sale-day-client"

export default async function SaleDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const query = supabase
    .from("sales")
    .select("*, sale_items(*, product:products(name, unit_type)), customer:customers(name)")
    .eq("shop_id", session.shop_id!)
    .eq("sale_date", date)
    .order("created_at", { ascending: false })

  if (session.branch_id) query.eq("branch_id", session.branch_id)

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
