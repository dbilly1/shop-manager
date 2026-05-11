"use client"

import { useState } from "react"

const C = {
  bg: "#0f0f0e",
  surface2: "#232320",
  border: "#2a2a27",
  ivory: "#e8e2d4",
  ivoryLight: "#f5f1ea",
  muted: "rgba(232,226,212,0.55)",
  accent: "#7cb97c",
}

export function LandingMobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        style={{
          display: "none",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0.375rem",
          color: C.ivoryLight,
        }}
        className="lp-hamburger"
      >
        {/* Three-bar icon */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 101,
          width: "280px",
          backgroundColor: C.surface2,
          borderLeft: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem",
          gap: "1.5rem",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s ease",
        }}
      >
        {/* Close button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: "1rem", color: C.ivoryLight }}>
            Shop<strong>Manager</strong>
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "0.25rem" }}
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {[
            { href: "#features", label: "Features" },
            { href: "#pricing",  label: "Pricing" },
            { href: "#faq",      label: "FAQ" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                padding: "0.75rem 0.5rem",
                fontSize: "0.9375rem",
                color: C.ivoryLight,
                textDecoration: "none",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginTop: "auto" }}>
          <a
            href="/signup"
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: C.ivory, color: "#0f0f0e", fontWeight: 600,
              padding: "0.75rem 1rem", borderRadius: "6px", textDecoration: "none",
              fontSize: "0.9rem",
            }}
          >
            Get Started Free
          </a>
          <a
            href="/login"
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid ${C.border}`, color: C.muted,
              padding: "0.75rem 1rem", borderRadius: "6px", textDecoration: "none",
              fontSize: "0.9rem",
            }}
          >
            Log In
          </a>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .lp-hamburger { display: flex !important; }
          .lp-desktop-nav { display: none !important; }
          .lp-desktop-cta { display: none !important; }
        }
      `}</style>
    </>
  )
}
