import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * /auth/callback
 *
 * Supabase redirects here after email confirmation (and OAuth if ever added).
 * The URL carries a one-time `code` query param (PKCE flow). We exchange it
 * for a session, set the session cookie, then redirect to `next` (default /dashboard).
 *
 * emailRedirectTo in signup should be:
 *   `${origin}/auth/callback?next=/onboarding`
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session is now set in cookies — redirect to the intended destination.
      const redirectUrl = new URL(next, origin)
      return NextResponse.redirect(redirectUrl)
    }

    console.error("[auth/callback] exchangeCodeForSession error:", error.message)
  }

  // Code missing or exchange failed — send back to login with an error hint.
  const loginUrl = new URL("/login", origin)
  loginUrl.searchParams.set("error", "confirmation_failed")
  return NextResponse.redirect(loginUrl)
}
