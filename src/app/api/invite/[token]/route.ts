import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: invite, error } = await admin
    .from("shop_invites")
    .select("*, shops(name)")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 })
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    shop_name: (invite.shops as { name: string } | null)?.name,
  })
}
