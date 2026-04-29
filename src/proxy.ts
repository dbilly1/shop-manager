import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

// Next.js 16 renamed `middleware` to `proxy`.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Run on all routes except static assets and the Stripe webhook (signature-auth)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
