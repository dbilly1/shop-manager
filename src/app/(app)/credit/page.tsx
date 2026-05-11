import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { CreditClient } from "./credit-client"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { canManageCredit } from "@/lib/permissions"

export default async function CreditPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!canManageCredit(session.role!)) redirect("/dashboard")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  const csQuery = supabase
    .from("credit_sales")
    .select(`
      *,
      customer:customers(id, name, phone),
      sale:sales(
        sale_date,
        recorded_by_name,
        sale_items(
          id,
          quantity_kg,
          quantity_units,
          quantity_boxes,
          unit_price,
          discount_amount,
          line_total,
          product:products(name, unit_type, units_per_box)
        )
      )
    `)
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })

  if (activeBranchId) csQuery.eq("branch_id", activeBranchId)

  const { data: creditSales } = await csQuery
  const { data: shop } = await supabase.from("shops").select("currency, credit_overdue_days").eq("id", session.shop_id!).single()

  // All payments — needed for the overview table (loaded per-customer lazily in the ledger view)
  const paymentsQuery = supabase
    .from("credit_payments")
    .select("id, customer_id, amount, payment_method, payment_date, notes, customer:customers(name)")
    .eq("shop_id", session.shop_id!)
    .order("payment_date", { ascending: false })
  if (activeBranchId) paymentsQuery.eq("branch_id", activeBranchId)
  const { data: allPayments } = await paymentsQuery

  return (
    <CreditClient
      creditSales={creditSales ?? []}
      allPayments={(allPayments ?? []) as unknown as { id: string; customer_id: string; amount: number; payment_method: string; payment_date: string; notes: string | null; customer: { name: string } | null }[]}
      currency={shop?.currency ?? "USD"}
      overdueThreshold={shop?.credit_overdue_days ?? 30}
      session={session}
    />
  )
}
