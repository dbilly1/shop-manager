import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { password } = await req.json()
  const admin = createAdminClient()

  // Validate invite
  const { data: invite, error: inviteError } = await admin
    .from("shop_invites")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 })
  }

  // Create or get user
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existingUser = existingUsers?.users.find((u) => u.email === invite.email)

  let userId: string

  if (existingUser) {
    // Update password
    await admin.auth.admin.updateUserById(existingUser.id, { password })
    userId = existingUser.id
  } else {
    // Create user
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })
    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message ?? "Failed to create user" }, { status: 500 })
    }
    userId = newUser.user.id
  }

  // Create shop_member
  const { error: memberError } = await admin.from("shop_members").upsert({
    shop_id: invite.shop_id,
    branch_id: invite.branch_id,
    user_id: userId,
    role: invite.role,
    invited_by: invite.invited_by,
    status: "active",
  }, { onConflict: "shop_id,user_id" })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Mark invite accepted
  await admin
    .from("shop_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)

  return NextResponse.json({ success: true })
}
