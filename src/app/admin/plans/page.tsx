import { createAdminClient } from "@/lib/supabase/admin"
import { AdminPlansClient } from "./admin-plans-client"

export default async function AdminPlansPage() {
  const admin = createAdminClient()
  const { data: plans } = await admin.from("plans").select("*").order("price_monthly")
  return <AdminPlansClient plans={plans ?? []} />
}
