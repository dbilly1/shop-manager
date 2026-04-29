"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Global error boundary]", error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "system-ui, sans-serif", background: "#0f0f0e", color: "#f5f1ea" }}>
          <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Application error</h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(232,226,212,0.6)", marginBottom: "1.5rem" }}>
              {error.message || "Something unexpected happened. Please try again."}
            </p>
            <button
              onClick={reset}
              style={{ background: "#e8e2d4", color: "#0f0f0e", border: "none", padding: "0.625rem 1.25rem", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
