"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Eye, EyeOff } from "lucide-react"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialEmail = searchParams.get("email") ?? ""
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isInvited =
    searchParams.get("invited") === "1" || !!searchParams.get("invite_token")

  const confirmationFailed = searchParams.get("error") === "confirmation_failed"
  const passwordReset = searchParams.get("message") === "password_reset"

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // If this login came from an invite link, activate the membership now
    const inviteToken = searchParams.get("invite_token")
    if (inviteToken) {
      const res = await fetch(`/api/invite/${inviteToken}/accept`, { method: "POST" })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? "Invite activation failed — contact your manager.")
        setLoading(false)
        return
      }
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f5f1ea", margin: 0, marginBottom: "0.25rem" }}>
          {isInvited ? "Account activated!" : "Welcome back"}
        </h2>
        <p style={{ fontSize: "0.85rem", color: "rgba(232,226,212,0.45)", margin: 0 }}>
          {isInvited
            ? "Sign in with the temporary password your manager gave you."
            : "Sign in to your account to continue"}
        </p>
      </div>

      {passwordReset && !error && (
        <div style={{
          background: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: "7px",
          padding: "0.625rem 0.875rem",
          fontSize: "0.8125rem",
          color: "#86efac",
          marginBottom: "1.25rem",
        }}>
          Password updated. Sign in with your new password.
        </div>
      )}

      {confirmationFailed && !error && (
        <div className="auth-error" style={{ marginBottom: "1.25rem" }}>
          That confirmation link has expired or is invalid. Sign in below — or{" "}
          <Link href="/signup" className="auth-link">create a new account</Link>.
        </div>
      )}

      {error && (
        <div className="auth-error" style={{ marginBottom: "1.25rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.375rem" }}>
            <label htmlFor="password" className="auth-label" style={{ margin: 0 }}>Password</label>
            <Link href="/forgot-password" className="auth-link" style={{ fontSize: "0.775rem" }}>
              Forgot password?
            </Link>
          </div>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="auth-input"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ paddingRight: "2.75rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              tabIndex={-1}
              style={{
                position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(232,226,212,0.4)", padding: 0, display: "flex", alignItems: "center",
              }}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <button type="submit" className="auth-btn" disabled={loading} style={{ marginTop: "0.25rem" }}>
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <hr className="auth-divider" />

      <p style={{ fontSize: "0.8375rem", textAlign: "center", color: "rgba(232,226,212,0.45)", margin: 0 }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="auth-link">
          Create one free
        </Link>
      </p>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 180 }} />}>
      <LoginForm />
    </Suspense>
  )
}
