import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireSuperAdmin } from "@/lib/auth-guard"

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (session instanceof NextResponse) return session

  const body = await req.json()
  const admin = createAdminClient()
  const { error } = await admin.from("announcements").insert({ ...body, created_by: session.user_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
