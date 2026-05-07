"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get("error") === "link_expired"

  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <>
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f5f1ea", margin: 0, marginBottom: "0.25rem" }}>
            Check your email
          </h2>
          <p style={{ fontSize: "0.85rem", color: "rgba(232,226,212,0.45)", margin: 0, lineHeight: 1.6 }}>
            If an account exists for{" "}
            <strong style={{ color: "rgba(232,226,212,0.75)" }}>{email}</strong>
            , a reset link has been sent. Check your spam folder if you don&apos;t see it.
          </p>
        </div>

        <hr className="auth-divider" />

        <p style={{ fontSize: "0.8375rem", textAlign: "center", color: "rgba(232,226,212,0.45)", margin: 0 }}>
          <Link href="/login" className="auth-link">Back to sign in</Link>
        </p>
      </>
    )
  }

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f5f1ea", margin: 0, marginBottom: "0.25rem" }}>
          Forgot password?
        </h2>
        <p style={{ fontSize: "0.85rem", color: "rgba(232,226,212,0.45)", margin: 0 }}>
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {linkExpired && !error && (
        <div className="auth-error" style={{ marginBottom: "1.25rem" }}>
          That reset link has expired or already been used. Request a new one below.
        </div>
      )}

      {error && (
        <div className="auth-error" style={{ marginBottom: "1.25rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
            autoFocus
            autoComplete="email"
          />
        </div>

        <button type="submit" className="auth-btn" disabled={loading} style={{ marginTop: "0.25rem" }}>
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {loading ? "Sending…" : "Send Reset Link"}
        </button>
      </form>

      <hr className="auth-divider" />

      <p style={{ fontSize: "0.8375rem", textAlign: "center", color: "rgba(232,226,212,0.45)", margin: 0 }}>
        Remember your password?{" "}
        <Link href="/login" className="auth-link">Sign in</Link>
      </p>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 180 }} />}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
