"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, CheckCircle, ArrowRight, Users, Package, LayoutDashboard, Store, Check } from "lucide-react"
import type { ShopType } from "@/types"
import {
  SUPPORTED_COUNTRIES,
  SUPPORTED_TIMEZONES,
  defaultTimezoneForCountry,
} from "@/lib/onboarding-options"

// ── Colours (match auth layout palette) ──────────────────────────────────────
const C = {
  bg:       "#181816",
  surface:  "#1e1e1b",
  border:   "#2a2a27",
  ivory:    "#e8e2d4",
  ivoryDim: "rgba(232,226,212,0.55)",
  muted:    "rgba(232,226,212,0.35)",
  accent:   "#7cb97c",
  error:    { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", text: "#fca5a5" },
}

// ── Static option lists ───────────────────────────────────────────────────────
const SHOP_TYPES: { value: ShopType; label: string }[] = [
  { value: "cold_store", label: "Cold Store" },
  { value: "pharmacy",   label: "Pharmacy" },
  { value: "hardware",   label: "Hardware Store" },
  { value: "boutique",   label: "Boutique" },
  { value: "general",    label: "General Merchandise" },
  { value: "other",      label: "Other" },
]

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "GHS", label: "GHS — Ghanaian Cedi" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "ZAR", label: "ZAR — South African Rand" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "EGP", label: "EGP — Egyptian Pound" },
]

// ── Types ─────────────────────────────────────────────────────────────────────
type Plan = {
  id: string
  name: string
  price_monthly: number
  max_branches: number
  max_users: number
  max_products: number
  feature_flags: Record<string, boolean>
}

const FALLBACK_PLANS: Plan[] = [
  { id: "free",    name: "Free",    price_monthly: 0,  max_branches: 1,  max_users: 5,   max_products: 100,  feature_flags: {} },
  { id: "starter", name: "Starter", price_monthly: 19, max_branches: 2,  max_users: 15,  max_products: 500,  feature_flags: { advanced_reports: true } },
  { id: "growth",  name: "Growth",  price_monthly: 49, max_branches: 5,  max_users: 50,  max_products: 2000, feature_flags: { advanced_reports: true, stock_transfers: true } },
  { id: "pro",     name: "Pro",     price_monthly: 99, max_branches: 20, max_users: 200, max_products: 10000,feature_flags: { advanced_reports: true, stock_transfers: true, api_access: true } },
]

// ── Small shared components ───────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: "0.375rem", marginBottom: "1.5rem" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i < current ? C.ivory : C.border,
            transition: "background 0.3s",
          }}
        />
      ))}
    </div>
  )
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="auth-label">{children}</label>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="auth-error" style={{ marginBottom: "1.25rem" }}>{message}</div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()

  const [step,    setStep]    = useState(1)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState("")
  const [loading, setLoading] = useState(false)

  // Plans (fetched once)
  const [plans,          setPlans]          = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>("")

  // Step 1 — shop info
  const [shopName, setShopName] = useState("")
  const [shopType, setShopType] = useState<ShopType>("general")
  const [currency, setCurrency] = useState("USD")
  const [country,  setCountry]  = useState("NG")
  const [timezone, setTimezone] = useState("Africa/Lagos")

  // Step 2 — branch
  const [branchName,    setBranchName]    = useState("Main Branch")
  const [branchAddress, setBranchAddress] = useState("")

  // Fetch plans on mount
  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then(({ plans: p }) => {
        if (Array.isArray(p) && p.length > 0) {
          setPlans(p)
          // Default to Free
          const free = p.find((x: Plan) => x.price_monthly === 0)
          setSelectedPlanId(free?.id ?? p[0].id)
        } else {
          setPlans(FALLBACK_PLANS)
          setSelectedPlanId(FALLBACK_PLANS[0].id)
        }
      })
      .catch(() => {
        setPlans(FALLBACK_PLANS)
        setSelectedPlanId(FALLBACK_PLANS[0].id)
      })
  }, [])

  function handleCountryChange(code: string) {
    setCountry(code)
    setTimezone(defaultTimezoneForCountry(code))
  }

  async function handleFinish() {
    setLoading(true)
    setError("")

    const res = await fetch("/api/onboarding", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopName, shopType, currency, country, timezone,
        branchName, branchAddress,
        planId: selectedPlanId,
      }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error ?? "Setup failed. Please try again.")
      setLoading(false)
      return
    }

    setLoading(false)
    setDone(true)
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) {
    const chosenPlan = plans.find((p) => p.id === selectedPlanId)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "0.75rem" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(124,185,124,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CheckCircle size={24} color={C.accent} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: C.ivory, margin: 0, marginBottom: "0.3rem" }}>
              You&apos;re all set!
            </h2>
            <p style={{ fontSize: "0.85rem", color: C.ivoryDim, margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: C.ivory }}>{shopName}</strong> is ready
              {chosenPlan ? ` on the ${chosenPlan.name} plan` : ""}.
            </p>
          </div>
        </div>

        {/* Next steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p style={{ fontSize: "0.75rem", color: C.muted, margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            What&apos;s next
          </p>
          <WelcomeLink href="/dashboard" icon={<LayoutDashboard size={16} />} label="Go to dashboard"     desc="See your overview and key metrics" primary onClick={() => router.refresh()} />
          <WelcomeLink href="/users"     icon={<Users size={16} />}           label="Invite your team"     desc="Add staff and assign their roles" />
          <WelcomeLink href="/inventory" icon={<Package size={16} />}         label="Add your products"    desc="Set up your product catalogue and stock levels" />
        </div>
      </div>
    )
  }

  // ── Step 1 — Shop info ────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <StepBar current={1} total={3} />

        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <Store size={16} color={C.ivoryDim} />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: C.ivory, margin: 0 }}>Set up your shop</h2>
          </div>
          <p style={{ fontSize: "0.8375rem", color: C.ivoryDim, margin: 0 }}>Tell us about your business</p>
        </div>

        {error && <ErrorBox message={error} />}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Shop name */}
          <div>
            <FieldLabel htmlFor="shopName">Shop name</FieldLabel>
            <input
              id="shopName"
              className="auth-input"
              placeholder="My Awesome Store"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Business type */}
          <div>
            <FieldLabel htmlFor="shopType">Business type</FieldLabel>
            <Select value={shopType} onValueChange={(v) => v && setShopType(v as ShopType)}>
              <SelectTrigger id="shopType" className="auth-input" style={{ height: "auto" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOP_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Country + Currency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <FieldLabel htmlFor="country">Country</FieldLabel>
              <Select value={country} onValueChange={(v) => v && handleCountryChange(v)}>
                <SelectTrigger id="country" className="auth-input" style={{ height: "auto" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                <SelectTrigger id="currency" className="auth-input" style={{ height: "auto" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
            <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
              <SelectTrigger id="timezone" className="auth-input" style={{ height: "auto" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p style={{ fontSize: "0.75rem", color: C.muted, marginTop: "0.375rem", margin: "0.375rem 0 0" }}>
              Used for daily report cut-offs and scheduled tasks.
            </p>
          </div>

          <button
            className="auth-btn"
            style={{ marginTop: "0.25rem" }}
            onClick={() => setStep(2)}
            disabled={!shopName.trim()}
          >
            Continue
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2 — First branch ─────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <StepBar current={2} total={3} />

        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: C.ivory, margin: 0, marginBottom: "0.25rem" }}>
            Your first branch
          </h2>
          <p style={{ fontSize: "0.8375rem", color: C.ivoryDim, margin: 0 }}>
            Every shop needs at least one branch. You can add more later.
          </p>
        </div>

        {error && <ErrorBox message={error} />}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <FieldLabel htmlFor="branchName">Branch name</FieldLabel>
            <input
              id="branchName"
              className="auth-input"
              placeholder="Main Branch"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <FieldLabel htmlFor="branchAddress">
              Address <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span>
            </FieldLabel>
            <input
              id="branchAddress"
              className="auth-input"
              placeholder="123 Main St, Lagos"
              value={branchAddress}
              onChange={(e) => setBranchAddress(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: "0.625rem", marginTop: "0.25rem" }}>
            <button
              className="auth-btn"
              style={{ background: "transparent", color: C.ivory, border: `1px solid ${C.border}` }}
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              className="auth-btn"
              onClick={() => setStep(3)}
              disabled={!branchName.trim()}
            >
              Continue
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 3 — Plan selection ───────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <StepBar current={3} total={3} />

      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: C.ivory, margin: 0, marginBottom: "0.25rem" }}>
          Choose your plan
        </h2>
        <p style={{ fontSize: "0.8375rem", color: C.ivoryDim, margin: 0 }}>
          Start free — upgrade or downgrade anytime.
        </p>
      </div>

      {error && <ErrorBox message={error} />}

      {/* Plan grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
        {plans.map((plan) => {
          const selected = selectedPlanId === plan.id
          const flags    = plan.feature_flags ?? {}
          const features = [
            `${plan.max_branches} branch${plan.max_branches !== 1 ? "es" : ""}`,
            `${plan.max_users} users`,
            `${plan.max_products.toLocaleString()} products`,
            ...(flags.advanced_reports  ? ["Advanced reports"]  : []),
            ...(flags.stock_transfers   ? ["Stock transfers"]    : []),
            ...(flags.api_access        ? ["API access"]         : []),
          ]
          return (
            <button
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              style={{
                background:   selected ? "rgba(232,226,212,0.07)" : "transparent",
                border:       `1px solid ${selected ? C.ivory : C.border}`,
                borderRadius: 8,
                padding:      "0.75rem",
                cursor:       "pointer",
                textAlign:    "left",
                position:     "relative",
                transition:   "border-color 0.2s, background 0.2s",
              }}
            >
              {selected && (
                <div style={{
                  position: "absolute", top: 6, right: 6,
                  width: 16, height: 16, borderRadius: "50%",
                  background: C.ivory,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check size={10} color="#0f0f0e" strokeWidth={3} />
                </div>
              )}

              <div style={{ fontSize: "0.7rem", color: C.muted, letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
                {plan.name.toUpperCase()}
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: C.ivory, lineHeight: 1, marginBottom: "0.5rem" }}>
                {plan.price_monthly === 0 ? "Free" : `$${plan.price_monthly}/mo`}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {features.slice(0, 3).map((f) => (
                  <li key={f} style={{ fontSize: "0.7rem", color: C.ivoryDim, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <span style={{ color: C.accent }}>✓</span> {f}
                  </li>
                ))}
                {features.length > 3 && (
                  <li style={{ fontSize: "0.7rem", color: C.muted }}>+{features.length - 3} more</li>
                )}
              </ul>
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: "0.75rem", color: C.muted, margin: "0 0 1rem", textAlign: "center" }}>
        All plans start on Free until billing is configured.
      </p>

      <div style={{ display: "flex", gap: "0.625rem" }}>
        <button
          className="auth-btn"
          style={{ background: "transparent", color: C.ivory, border: `1px solid ${C.border}` }}
          onClick={() => setStep(2)}
          disabled={loading}
        >
          Back
        </button>
        <button
          className="auth-btn"
          onClick={handleFinish}
          disabled={loading || !selectedPlanId}
        >
          {loading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={15} />}
          {loading ? "Setting up…" : "Finish setup"}
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Welcome link card ─────────────────────────────────────────────────────────

function WelcomeLink({
  icon, href, label, desc, primary = false, onClick,
}: {
  icon: React.ReactNode; href: string; label: string; desc: string
  primary?: boolean; onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            "0.75rem",
        padding:        "0.625rem 0.75rem",
        borderRadius:   7,
        border:         `1px solid ${primary ? "rgba(232,226,212,0.25)" : "#2a2a27"}`,
        background:     primary ? "rgba(232,226,212,0.05)" : "transparent",
        textDecoration: "none",
        transition:     "background 0.2s, border-color 0.2s",
        cursor:         "pointer",
      }}
    >
      <div style={{
        flexShrink: 0, color: primary ? "#e8e2d4" : "rgba(232,226,212,0.55)",
        display: "flex", alignItems: "center",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#e8e2d4", margin: 0 }}>{label}</p>
        <p style={{ fontSize: "0.75rem", color: "rgba(232,226,212,0.45)", margin: 0 }}>{desc}</p>
      </div>
      <ArrowRight size={14} color="rgba(232,226,212,0.35)" style={{ flexShrink: 0 }} />
    </Link>
  )
}
