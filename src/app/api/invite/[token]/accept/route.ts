import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // The user must be signed in — their ID is used for the membership
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Please sign in before activating your account" }, { status: 401 })
  }

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

  // Verify the signed-in user's email matches the invite
  if (user.email?.toLowerCase() !== invite.email?.toLowerCase()) {
    return NextResponse.json(
      { error: `This invite is for ${invite.email}. Please sign in with that account.` },
      { status: 403 }
    )
  }

  // Activate shop membership
  const { error: memberError } = await admin.from("shop_members").upsert(
    {
      shop_id: invite.shop_id,
      branch_id: invite.branch_id,
      user_id: user.id,
      role: invite.role,
      invited_by: invite.invited_by,
      status: "active",
    },
    { onConflict: "shop_id,user_id" }
  )

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Mark invite accepted and scrub the temporary password
  await admin
    .from("shop_invites")
    .update({ accepted_at: new Date().toISOString(), temp_password: null })
    .eq("id", invite.id)

  return NextResponse.json({ success: true })
}
