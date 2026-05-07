import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * /auth/callback
 *
 * Supabase redirects here after:
 *  - Email confirmation (signup)           → next defaults to /dashboard
 *  - Password recovery (forgot password)  → next = /reset-password
 *  - OAuth (if ever added)
 *
 * The URL carries a one-time `code` query param (PKCE flow). We exchange it
 * for a session, set the session cookie, then redirect to `next`.
 *
 * emailRedirectTo examples:
 *   Signup:          `${origin}/auth/callback?next=/onboarding`
 *   Password reset:  `${origin}/auth/callback?next=/reset-password`
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
      // For password recovery, `next` will be /reset-password so the user can
      // set a new password while the recovery session is active.
      const redirectUrl = new URL(next, origin)
      return NextResponse.redirect(redirectUrl)
    }

    console.error("[auth/callback] exchangeCodeForSession error:", error.message)
  }

  // Code missing or exchange failed.
  // If this was a password reset attempt, send to forgot-password with a hint.
  if (next === "/reset-password") {
    const url = new URL("/forgot-password", origin)
    url.searchParams.set("error", "link_expired")
    return NextResponse.redirect(url)
  }

  // Otherwise send back to login.
  const loginUrl = new URL("/login", origin)
  loginUrl.searchParams.set("error", "confirmation_failed")
  return NextResponse.redirect(loginUrl)
}
