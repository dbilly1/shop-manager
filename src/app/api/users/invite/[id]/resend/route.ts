import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomBytes } from "crypto"
import { sendInviteEmail } from "@/lib/email"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const newToken = randomBytes(32).toString("hex")
  const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

  const { data: invite, error } = await admin
    .from("shop_invites")
    .update({ token: newToken, expires_at: newExpiry })
    .eq("id", id)
    .select("email, role, shop_id")
    .single()

  if (error || !invite) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteLink = `${appUrl}/invite/${newToken}`

  const { data: shop } = await admin.from("shops").select("name").eq("id", invite.shop_id).single()

  await sendInviteEmail({
    to: invite.email,
    inviteLink,
    shopName: shop?.name ?? "your shop",
    role: invite.role,
  })

  return NextResponse.json({ success: true })
}
