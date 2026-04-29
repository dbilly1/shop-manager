import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/auth-guard"

export async function POST(req: NextRequest) {
  const guard = await requireRole(["owner", "general_manager"])
  if (guard instanceof NextResponse) return guard

  const { adjustment_id } = await req.json()
  if (!adjustment_id) {
    return NextResponse.json({ error: "adjustment_id required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("approve_stock_adjustment", {
    p_adjustment_id: adjustment_id,
    p_approver_id: guard.user_id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
