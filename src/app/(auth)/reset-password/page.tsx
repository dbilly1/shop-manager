"use client"

import { Suspense, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Eye, EyeOff } from "lucide-react"

function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }

    // Sign out globally — invalidates all sessions across every device,
    // not just this recovery session. Anyone else logged in as this user
    // (including the recovery session itself) is kicked out immediately.
    await supabase.auth.signOut({ scope: "global" })
    setLoading(false)
    setDone(true)
    setTimeout(() => router.replace("/login?message=password_reset"), 2000)
  }

  if (done) {
    return (
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f5f1ea", margin: 0, marginBottom: "0.5rem" }}>
          Password updated ✓
        </h2>
        <p style={{ fontSize: "0.85rem", color: "rgba(232,226,212,0.45)", margin: 0 }}>
          Redirecting you to sign in…
        </p>
      </div>
    )
  }

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f5f1ea", margin: 0, marginBottom: "0.25rem" }}>
          Set new password
        </h2>
        <p style={{ fontSize: "0.85rem", color: "rgba(232,226,212,0.45)", margin: 0 }}>
          Choose a strong password with at least 8 characters.
        </p>
      </div>

      {error && (
        <div className="auth-error" style={{ marginBottom: "1.25rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label htmlFor="password" className="auth-label">New password</label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="auth-input"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              autoComplete="new-password"
              style={{ paddingRight: "2.75rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              style={{
                position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(232,226,212,0.4)", padding: 0, display: "flex", alignItems: "center",
              }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="auth-label">Confirm new password</label>
          <input
            id="confirm"
            type={showPassword ? "text" : "password"}
            className="auth-input"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="auth-btn" disabled={loading} style={{ marginTop: "0.25rem" }}>
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 180 }} />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
