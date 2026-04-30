"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Mail } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  const [name,     setName]     = useState("")
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)

  // If Supabase requires email confirmation the session is null after signUp;
  // in that case we show a "check your email" screen rather than navigating.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [sentTo, setSentTo] = useState("")

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      // Email confirmation is disabled — user is signed in immediately.
      router.push("/onboarding")
      router.refresh()
      // keep loading=true so there's no flash before navigation
    } else {
      // Email confirmation is required — show "check your email" screen.
      setSentTo(email)
      setAwaitingConfirmation(true)
      setLoading(false)
    }
  }

  // ── Check-your-email screen ────────────────────────────────────────────────
  if (awaitingConfirmation) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "1rem" }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(232,226,212,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Mail size={24} style={{ color: "#f5f1ea" }} />
          </div>

          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: "#f5f1ea", margin: 0, marginBottom: "0.5rem" }}>
              Check your email
            </h2>
            <p style={{ fontSize: "0.875rem", color: "rgba(232,226,212,0.55)", margin: 0, lineHeight: 1.65 }}>
              We sent a confirmation link to{" "}
              <strong style={{ color: "#f5f1ea" }}>{sentTo}</strong>.
              <br />
              Click it to verify your address and set up your shop.
            </p>
          </div>

          <div style={{
            width: "100%",
            background: "rgba(232,226,212,0.05)",
            border: "1px solid rgba(232,226,212,0.12)",
            borderRadius: 8,
            padding: "0.875rem 1rem",
            fontSize: "0.8125rem",
            color: "rgba(232,226,212,0.45)",
            textAlign: "left",
          }}>
            Didn&apos;t get it? Check your spam folder, or{" "}
            <button
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: "#f5f1ea", textDecoration: "underline", fontSize: "inherit",
              }}
              onClick={() => setAwaitingConfirmation(false)}
            >
              go back and try again
            </button>
            .
          </div>
        </div>

        <hr className="auth-divider" />
        <p style={{ fontSize: "0.8375rem", textAlign: "center", color: "rgba(232,226,212,0.45)", margin: 0 }}>
          Already verified?{" "}
          <Link href="/login" className="auth-link">Sign in</Link>
        </p>
      </>
    )
  }

  // ── Sign-up form ───────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f5f1ea", margin: 0, marginBottom: "0.25rem" }}>
          Create your account
        </h2>
        <p style={{ fontSize: "0.85rem", color: "rgba(232,226,212,0.45)", margin: 0 }}>
          Start your free ShopManager account — no credit card needed
        </p>
      </div>

      {error && (
        <div className="auth-error" style={{ marginBottom: "1.25rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label htmlFor="name" className="auth-label">Full name</label>
          <input
            id="name"
            type="text"
            className="auth-input"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="email" className="auth-label">Email address</label>
          <input
            id="email"
            type="email"
            className="auth-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="auth-label">Password</label>
          <input
            id="password"
            type="password"
            className="auth-input"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="auth-btn" disabled={loading} style={{ marginTop: "0.25rem" }}>
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {loading ? "Creating account…" : "Create free account"}
        </button>
      </form>

      <hr className="auth-divider" />

      <p style={{ fontSize: "0.8375rem", textAlign: "center", color: "rgba(232,226,212,0.45)", margin: 0 }}>
        Already have an account?{" "}
        <Link href="/login" className="auth-link">Sign in</Link>
      </p>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
