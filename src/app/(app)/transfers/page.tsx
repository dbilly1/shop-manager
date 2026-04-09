import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { TransfersClient } from "./transfers-client"

export default async function TransfersPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const { data: transfers } = await supabase
    .from("stock_transfers")
    .select("*, product:products(name, unit_type), from_branch:branches!from_branch_id(name), to_branch:branches!to_branch_id(name)")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(100)

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("shop_id", session.shop_id!)
    .eq("status", "active")

  const { data: products } = await supabase
    .from("products")
    .select("id, name, unit_type")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)
    .order("name")

  return (
    <TransfersClient
      transfers={transfers ?? []}
      branches={branches ?? []}
      products={products ?? []}
      session={session}
    />
  )
}
