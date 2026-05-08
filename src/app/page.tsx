import Link from "next/link"
import { Playfair_Display, DM_Sans, DM_Mono } from "next/font/google"
import { createAdminClient } from "@/lib/supabase/admin"

const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", weight: ["400", "700", "900"] })
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" })
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono" })

const C = {
  bg: "#0f0f0e",
  surface: "#181816",
  surface2: "#232320",
  border: "#2a2a27",
  ivory: "#e8e2d4",
  ivoryLight: "#f5f1ea",
  muted: "rgba(232,226,212,0.55)",
  muted2: "rgba(232,226,212,0.35)",
  accent: "#7cb97c",
}

const FEATURES = [
  { num: "01", title: "Sales Management", desc: "Record sales instantly — single or bulk entry, with cash, mobile money, and credit payment tracking." },
  { num: "02", title: "Inventory Control", desc: "Track stock levels in real-time across all branches. Get automatic low-stock alerts before you run out." },
  { num: "03", title: "Financial Reports", desc: "Revenue breakdown, profit margins, expense analysis, and branch comparisons — all in one place." },
  { num: "04", title: "Credit Management", desc: "Track customer credit balances and repayments. Never lose track of who owes what." },
  { num: "05", title: "Multi-Staff Access", desc: "Invite your team with role-based permissions. Owners, managers, supervisors, salespeople — all covered." },
  { num: "06", title: "Multi-Branch", desc: "Manage multiple store locations from one dashboard. Consolidated reports or branch-by-branch views." },
]

const HOW_IT_WORKS = [
  { step: "01", title: "Sign up free", desc: "Create your account in under a minute — no credit card required. Your free plan is ready instantly." },
  { step: "02", title: "Set up your shop", desc: "Add your products, create branches, set prices, and invite your team. Takes about ten minutes." },
  { step: "03", title: "Start selling", desc: "Record sales, track stock, manage credit, and get real-time insights from day one." },
]

const TESTIMONIALS = [
  { name: "Sarah A.", role: "Cold Store Owner", text: "Finally a system that makes sense for a small shop. Setup took 10 minutes and my staff picked it up instantly." },
  { name: "Michael K.", role: "Hardware Store Manager", text: "The multi-branch view is exactly what I needed. I can see all three locations in one place." },
  { name: "Priya M.", role: "Boutique Owner", text: "Credit tracking used to be in a notebook. Now it's instant and I never miss a repayment." },
]

const FAQ = [
  { q: "Is there a free plan?", a: "Yes. The free plan includes 1 branch, 5 users, and 100 products — enough to get started with no cost, forever." },
  { q: "Can I manage multiple shop locations?", a: "Yes. Paid plans support multiple branches. You get a consolidated dashboard and can drill into any individual branch." },
  { q: "How is my data kept private?", a: "Each shop's data is completely isolated using Supabase Row-Level Security. No shop can ever see another shop's data." },
  { q: "Can I invite staff with limited access?", a: "Yes. Assign roles like Branch Manager, Supervisor, and Salesperson — each with appropriate permissions." },
  { q: "What payment methods does ShopManager track?", a: "Cash, Mobile Money, and Credit (customer credit). You can reconcile cash and mobile balances daily." },
]

export default async function LandingPage() {
  let plans: Array<{ name: string; price_monthly: number; max_branches: number; max_users: number; max_products: number; feature_flags: Record<string, boolean> }> = []
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("plans").select("name, price_monthly, max_branches, max_users, max_products, feature_flags").eq("is_active", true).order("price_monthly")
    plans = data ?? []
  } catch {
    plans = [
      { name: "Free", price_monthly: 0, max_branches: 1, max_users: 5, max_products: 100, feature_flags: {} },
      { name: "Starter", price_monthly: 19, max_branches: 2, max_users: 15, max_products: 500, feature_flags: { advanced_reports: true } },
      { name: "Growth", price_monthly: 49, max_branches: 5, max_users: 50, max_products: 2000, feature_flags: { advanced_reports: true, stock_transfers: true, audit_log: true } },
      { name: "Pro", price_monthly: 99, max_branches: 20, max_users: 200, max_products: 10000, feature_flags: { advanced_reports: true, stock_transfers: true, audit_log: true, api_access: true, custom_branding: true } },
    ]
  }

  const fontVars = `${playfair.variable} ${dmSans.variable} ${dmMono.variable}`

  return (
    <div
      className={fontVars}
      style={{
        backgroundColor: C.bg,
        color: C.ivoryLight,
        fontFamily: "var(--font-dm-sans, sans-serif)",
        minHeight: "100vh",
      }}
    >
      <style>{`
        .lp-serif { font-family: var(--font-playfair, serif); }
        .lp-mono  { font-family: var(--font-dm-mono, monospace); }

        .lp-feature-card { border-bottom: 2px solid transparent; transition: border-color 0.25s; }
        .lp-feature-card:hover { border-bottom-color: ${C.ivory}; }

        .lp-nav-link { color: ${C.muted}; text-decoration: none; font-size: 0.875rem; transition: color 0.2s; }
        .lp-nav-link:hover { color: ${C.ivoryLight}; }

        .lp-btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
          background: ${C.ivory}; color: #0f0f0e; font-weight: 600; font-size: 0.875rem;
          padding: 0.625rem 1.375rem; border-radius: 6px; text-decoration: none;
          border: none; cursor: pointer; transition: background 0.2s, opacity 0.2s;
          font-family: var(--font-dm-sans, sans-serif);
        }
        .lp-btn-primary:hover { background: ${C.ivoryLight}; }
        .lp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .lp-btn-ghost {
          display: inline-flex; align-items: center; justify-content: center;
          background: transparent; color: ${C.muted}; font-weight: 500; font-size: 0.875rem;
          padding: 0.625rem 1.125rem; border-radius: 6px; text-decoration: none;
          border: 1px solid ${C.border}; cursor: pointer; transition: color 0.2s, border-color 0.2s;
          font-family: var(--font-dm-sans, sans-serif);
        }
        .lp-btn-ghost:hover { color: ${C.ivoryLight}; border-color: rgba(232,226,212,0.3); }

        .lp-btn-outline {
          display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
          background: transparent; color: ${C.ivory}; font-weight: 600; font-size: 0.875rem;
          padding: 0.625rem 1.375rem; border-radius: 6px; text-decoration: none;
          border: 1px solid rgba(232,226,212,0.35); cursor: pointer; transition: background 0.2s, border-color 0.2s;
          font-family: var(--font-dm-sans, sans-serif);
        }
        .lp-btn-outline:hover { background: rgba(232,226,212,0.07); border-color: rgba(232,226,212,0.6); }

        .lp-badge {
          display: inline-flex; align-items: center;
          border: 1px solid ${C.border}; border-radius: 999px;
          padding: 0.25rem 0.875rem; font-size: 0.75rem; color: ${C.muted};
          font-family: var(--font-dm-mono, monospace); letter-spacing: 0.04em;
        }
        .lp-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.accent}; margin-right: 0.5rem; display: inline-block; }

        .lp-pricing-featured {
          border: 1px solid rgba(232,226,212,0.5) !important;
          box-shadow: 0 0 40px rgba(232,226,212,0.06);
        }

        .lp-faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
        .lp-faq summary::-webkit-details-marker { display: none; }
        .lp-faq summary::after { content: "+"; font-size: 1.25rem; color: ${C.muted}; transition: transform 0.2s; }
        .lp-faq[open] summary::after { content: "−"; }

        .lp-dot-pattern {
          background-image: radial-gradient(circle, rgba(232,226,212,0.12) 1px, transparent 1px);
          background-size: 24px 24px;
        }

        .lp-mockup-bar { height: 3px; border-radius: 2px; background: rgba(232,226,212,0.15); overflow: hidden; }
        .lp-mockup-bar-fill { height: 100%; border-radius: 2px; }

        @media (max-width: 768px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; }
          .lp-mockup-wrapper { display: none !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-how-grid { grid-template-columns: 1fr !important; }
          .lp-pricing-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-testimonials-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        borderBottom: `1px solid ${C.border}`,
        backgroundColor: "rgba(15,15,14,0.85)",
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 1.5rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span className="lp-serif" style={{ fontSize: "1.2rem", color: C.ivoryLight, fontWeight: 400, letterSpacing: "-0.01em" }}>
              Shop<strong style={{ fontWeight: 700 }}>Manager</strong>
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#pricing" className="lp-nav-link">Pricing</a>
            <a href="#faq" className="lp-nav-link">FAQ</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <a href="/login" className="lp-btn-ghost">Log In</a>
            <a href="/signup" className="lp-btn-primary">Get Started Free</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "5rem 1.5rem 4rem" }}>
        <div className="lp-hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4rem", alignItems: "center" }}>
          {/* Left */}
          <div>
            <div className="lp-badge" style={{ marginBottom: "1.75rem" }}>
              <span className="lp-badge-dot" />
              Now in beta · Trusted by 500+ shops
            </div>
            <h1 className="lp-serif" style={{ fontSize: "clamp(2.4rem, 5vw, 3.5rem)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.02em", color: C.ivoryLight, margin: 0 }}>
              Run your shop.
              <br />
              <em style={{ fontStyle: "italic", color: C.muted }}>Not spreadsheets.</em>
            </h1>
            <p style={{ marginTop: "1.5rem", fontSize: "1rem", color: C.muted, lineHeight: 1.7, maxWidth: "440px" }}>
              ShopManager gives retail businesses everything they need — sales, inventory, expenses, credit, and reports — in one platform. Free to start.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "2.25rem" }}>
              <a href="/signup" className="lp-btn-primary" style={{ fontSize: "0.9375rem", padding: "0.75rem 1.75rem" }}>
                Get Started Free
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
              <a href="#pricing" className="lp-btn-outline" style={{ fontSize: "0.9375rem", padding: "0.75rem 1.75rem" }}>See Pricing</a>
            </div>
            <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: C.muted2 }}>No credit card required · Free plan forever</p>
          </div>

          {/* Right — dashboard mockup */}
          <div className="lp-mockup-wrapper" style={{ position: "relative" }}>
            <div style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}>
              {/* Mockup top bar */}
              <div style={{ backgroundColor: C.surface2, padding: "0.75rem 1rem", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ff6b6b" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ffd93d" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#6bcb77" }} />
                <span className="lp-mono" style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: C.muted2 }}>Dashboard</span>
              </div>
              {/* Mockup content */}
              <div style={{ padding: "1.25rem" }}>
                {/* Stat row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                  {[
                    { label: "Revenue", val: "GH₵ 14,220", up: true },
                    { label: "Sales", val: "342", up: true },
                    { label: "Credit Out", val: "GH₵ 1,840", up: false },
                  ].map(s => (
                    <div key={s.label} style={{ backgroundColor: C.surface2, borderRadius: "8px", padding: "0.75rem", border: `1px solid ${C.border}` }}>
                      <div className="lp-mono" style={{ fontSize: "0.6rem", color: C.muted2, letterSpacing: "0.06em", marginBottom: "0.35rem" }}>{s.label}</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: C.ivoryLight }}>{s.val}</div>
                      <div style={{ fontSize: "0.6rem", color: s.up ? "#6bcb77" : "#ff8787", marginTop: "0.2rem" }}>{s.up ? "▲ 12%" : "▼ 3%"}</div>
                    </div>
                  ))}
                </div>
                {/* Chart area */}
                <div style={{ backgroundColor: C.surface2, borderRadius: "8px", padding: "0.875rem", border: `1px solid ${C.border}`, marginBottom: "1rem" }}>
                  <div className="lp-mono" style={{ fontSize: "0.6rem", color: C.muted2, letterSpacing: "0.06em", marginBottom: "0.75rem" }}>WEEKLY REVENUE</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "0.4rem", height: "60px" }}>
                    {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, backgroundColor: i === 5 ? C.ivory : "rgba(232,226,212,0.18)", borderRadius: "3px 3px 0 0" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem" }}>
                    {["M","T","W","T","F","S","S"].map((d, i) => (
                      <span key={i} className="lp-mono" style={{ fontSize: "0.55rem", color: C.muted2, flex: 1, textAlign: "center" }}>{d}</span>
                    ))}
                  </div>
                </div>
                {/* Sales rows */}
                <div style={{ backgroundColor: C.surface2, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <div style={{ padding: "0.6rem 0.875rem", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                    <span className="lp-mono" style={{ fontSize: "0.6rem", color: C.muted2, letterSpacing: "0.06em" }}>RECENT SALES</span>
                    <span className="lp-mono" style={{ fontSize: "0.6rem", color: C.muted2 }}>TODAY</span>
                  </div>
                  {[
                    { item: "Rice 50kg", amt: "GH₵ 320", method: "Cash" },
                    { item: "Cooking Oil ×6", amt: "GH₵ 180", method: "Mobile" },
                    { item: "Sugar 25kg", amt: "GH₵ 95", method: "Credit" },
                  ].map((row, i) => (
                    <div key={i} style={{ padding: "0.5rem 0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < 2 ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ fontSize: "0.7rem", color: C.muted }}>{row.item}</span>
                      <span style={{ fontSize: "0.7rem", color: C.ivoryLight, fontWeight: 600 }}>{row.amt}</span>
                      <span style={{ fontSize: "0.6rem", color: C.muted2 }}>{row.method}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Subtle glow */}
            <div style={{ position: "absolute", inset: "-1px", borderRadius: "12px", background: "radial-gradient(ellipse at top, rgba(232,226,212,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ maxWidth: "1100px", margin: "0 auto", padding: "4rem 1.5rem" }}>
        <div style={{ marginBottom: "3rem" }}>
          <div className="lp-mono lp-badge" style={{ marginBottom: "1rem", display: "inline-flex" }}>WHAT YOU GET</div>
          <h2 className="lp-serif" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", fontWeight: 700, color: C.ivoryLight, margin: 0, letterSpacing: "-0.02em" }}>
            Everything your shop needs
          </h2>
          <p style={{ marginTop: "0.75rem", color: C.muted, maxWidth: "400px" }}>From first sale to full financial overview, all in one place.</p>
        </div>
        <div className="lp-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0" }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.num}
              className="lp-feature-card"
              style={{
                padding: "2rem 1.75rem",
                borderTop: `1px solid ${C.border}`,
                borderRight: (i % 3 !== 2) ? `1px solid ${C.border}` : "none",
              }}
            >
              <div className="lp-mono" style={{ fontSize: "0.7rem", color: C.muted2, letterSpacing: "0.08em", marginBottom: "1.25rem" }}>{f.num}</div>
              <h3 className="lp-serif" style={{ fontSize: "1.15rem", fontWeight: 700, color: C.ivoryLight, marginBottom: "0.5rem" }}>{f.title}</h3>
              <p style={{ fontSize: "0.875rem", color: C.muted, lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
          {/* Bottom border line for last row */}
          <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.border}` }} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ backgroundColor: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "5rem 1.5rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ marginBottom: "3.5rem" }}>
            <div className="lp-mono lp-badge" style={{ marginBottom: "1rem", display: "inline-flex" }}>HOW IT WORKS</div>
            <h2 className="lp-serif" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", fontWeight: 700, color: C.ivoryLight, margin: 0, letterSpacing: "-0.02em" }}>
              Up and running in minutes
            </h2>
          </div>
          <div className="lp-how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3rem" }}>
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.step} style={{ position: "relative", paddingTop: "1rem" }}>
                <div className="lp-serif" style={{ fontSize: "5rem", fontWeight: 900, color: "rgba(232,226,212,0.06)", lineHeight: 1, position: "absolute", top: 0, left: 0 }}>{s.step}</div>
                <div style={{ position: "relative", paddingTop: "2.5rem" }}>
                  <h3 className="lp-serif" style={{ fontSize: "1.3rem", fontWeight: 700, color: C.ivoryLight, marginBottom: "0.625rem" }}>{s.title}</h3>
                  <p style={{ fontSize: "0.9rem", color: C.muted, lineHeight: 1.7 }}>{s.desc}</p>
                </div>
                {i < 2 && (
                  <div style={{ position: "absolute", top: "4rem", right: "-1.5rem", color: C.muted2, fontSize: "1.25rem", display: "none" }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ maxWidth: "1100px", margin: "0 auto", padding: "5rem 1.5rem" }}>
        <div style={{ marginBottom: "3rem" }}>
          <div className="lp-mono lp-badge" style={{ marginBottom: "1rem", display: "inline-flex" }}>PRICING</div>
          <h2 className="lp-serif" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", fontWeight: 700, color: C.ivoryLight, margin: 0, letterSpacing: "-0.02em" }}>
            Simple, transparent pricing
          </h2>
          <p style={{ marginTop: "0.75rem", color: C.muted }}>Start free. Upgrade when you grow.</p>
        </div>
        <div className="lp-pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          {plans.map((plan, i) => {
            const isFeatured = i === 2
            const flags = plan.feature_flags as Record<string, boolean>
            return (
              <div
                key={plan.name}
                className={isFeatured ? "lp-pricing-featured" : ""}
                style={{
                  backgroundColor: isFeatured ? C.surface2 : C.surface,
                  border: isFeatured ? undefined : `1px solid ${C.border}`,
                  borderRadius: "10px",
                  padding: "1.75rem 1.5rem",
                  position: "relative",
                }}
              >
                {isFeatured && (
                  <div style={{ position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%)" }}>
                    <span className="lp-mono" style={{ backgroundColor: C.ivory, color: "#0f0f0e", fontSize: "0.65rem", fontWeight: 600, padding: "0.2rem 0.75rem", borderRadius: "0 0 6px 6px", letterSpacing: "0.06em" }}>MOST POPULAR</span>
                  </div>
                )}
                <div>
                  <div className="lp-mono" style={{ fontSize: "0.7rem", color: C.muted2, letterSpacing: "0.08em", marginBottom: "0.625rem" }}>{plan.name.toUpperCase()}</div>
                  <div className="lp-serif" style={{ fontSize: "2.25rem", fontWeight: 700, color: C.ivoryLight, lineHeight: 1 }}>
                    {plan.price_monthly === 0 ? "Free" : `GH₵${plan.price_monthly}`}
                  </div>
                  {plan.price_monthly > 0 && <div style={{ fontSize: "0.8rem", color: C.muted, marginTop: "0.25rem" }}>per month</div>}
                </div>
                <div style={{ margin: "1.5rem 0", borderTop: `1px solid ${C.border}` }} />
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {[
                    `${plan.max_branches} branch${plan.max_branches !== 1 ? "es" : ""}`,
                    `${plan.max_users} users`,
                    `${plan.max_products.toLocaleString()} products`,
                    ...(flags.advanced_reports ? ["Advanced reports"] : []),
                    ...(flags.stock_transfers ? ["Stock transfers"] : []),
                    ...(flags.audit_log ? ["Audit log"] : []),
                    ...(flags.api_access ? ["API access"] : []),
                    ...(flags.custom_branding ? ["Custom branding"] : []),
                  ].map((feat) => (
                    <li key={feat} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.825rem", color: C.muted }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      {feat}
                    </li>
                  ))}
                </ul>
                <a
                  href="/signup"
                  className={isFeatured ? "lp-btn-primary" : "lp-btn-outline"}
                  style={{ display: "flex", justifyContent: "center", marginTop: "1.75rem" }}
                >
                  {plan.price_monthly === 0 ? "Get Started Free" : "Start Trial"}
                </a>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ backgroundColor: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "5rem 1.5rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ marginBottom: "3rem" }}>
            <div className="lp-mono lp-badge" style={{ marginBottom: "1rem", display: "inline-flex" }}>TESTIMONIALS</div>
            <h2 className="lp-serif" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", fontWeight: 700, color: C.ivoryLight, margin: 0, letterSpacing: "-0.02em" }}>
              What shop owners say
            </h2>
          </div>
          <div className="lp-testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" }}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} style={{ backgroundColor: C.surface2, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "1.75rem" }}>
                <div style={{ display: "flex", gap: "2px", marginBottom: "1rem" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={C.ivory}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  ))}
                </div>
                <p style={{ fontSize: "0.9rem", color: C.muted, lineHeight: 1.7, marginBottom: "1.25rem" }}>&ldquo;{t.text}&rdquo;</p>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: C.ivoryLight }}>{t.name}</div>
                  <div style={{ fontSize: "0.75rem", color: C.muted2 }}>{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ maxWidth: "720px", margin: "0 auto", padding: "5rem 1.5rem" }}>
        <div style={{ marginBottom: "3rem" }}>
          <div className="lp-mono lp-badge" style={{ marginBottom: "1rem", display: "inline-flex" }}>FAQ</div>
          <h2 className="lp-serif" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", fontWeight: 700, color: C.ivoryLight, margin: 0, letterSpacing: "-0.02em" }}>
            Frequently asked questions
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {FAQ.map((item, i) => (
            <details
              key={item.q}
              className="lp-faq"
              style={{ borderTop: `1px solid ${C.border}`, ...(i === FAQ.length - 1 ? { borderBottom: `1px solid ${C.border}` } : {}) }}
            >
              <summary style={{ padding: "1.25rem 0", fontSize: "0.9375rem", fontWeight: 500, color: C.ivoryLight }}>
                {item.q}
              </summary>
              <p style={{ fontSize: "0.875rem", color: C.muted, lineHeight: 1.7, paddingBottom: "1.25rem", margin: 0 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="lp-dot-pattern" style={{ backgroundColor: C.surface, borderTop: `1px solid ${C.border}`, padding: "6rem 1.5rem", textAlign: "center" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2 className="lp-serif" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, color: C.ivoryLight, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            Ready to run a smarter shop?
          </h2>
          <p style={{ marginTop: "1rem", fontSize: "1rem", color: C.muted }}>
            Join hundreds of shop owners who&apos;ve simplified their operations.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "2.25rem", flexWrap: "wrap" }}>
            <a href="/signup" className="lp-btn-primary" style={{ fontSize: "0.9375rem", padding: "0.75rem 2rem" }}>
              Start for free — no card needed
            </a>
            <a href="/login" className="lp-btn-ghost" style={{ fontSize: "0.9375rem", padding: "0.75rem 1.75rem" }}>
              Log In
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "2rem 1.5rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <span className="lp-serif" style={{ fontSize: "1rem", color: C.ivoryLight, fontWeight: 700 }}>ShopManager</span>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <a href="#" style={{ fontSize: "0.8rem", color: C.muted2, textDecoration: "none" }}>Privacy Policy</a>
            <a href="#" style={{ fontSize: "0.8rem", color: C.muted2, textDecoration: "none" }}>Terms of Service</a>
            <a href="#" style={{ fontSize: "0.8rem", color: C.muted2, textDecoration: "none" }}>Contact</a>
          </div>
          <span style={{ fontSize: "0.8rem", color: C.muted2 }}>© {new Date().getFullYear()} ShopManager. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
