import { Button } from "@/components/ui/button"
import { LinkButton } from "@/components/ui/link-button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  ShoppingCart, Package, BarChart3, CreditCard, Users, Building2,
  CheckCircle, ArrowRight, Star
} from "lucide-react"

const FEATURES = [
  { icon: ShoppingCart, title: "Sales Management", desc: "Record sales instantly — single or bulk entry, with cash, mobile, and credit payment tracking." },
  { icon: Package, title: "Inventory Control", desc: "Track stock levels in real-time across all branches. Get automatic low-stock alerts before you run out." },
  { icon: BarChart3, title: "Financial Reports", desc: "Revenue breakdown, profit margins, expense analysis, and branch comparisons — all in one place." },
  { icon: CreditCard, title: "Credit Management", desc: "Track customer credit balances and repayments. Never lose track of who owes what." },
  { icon: Users, title: "Multi-Staff Access", desc: "Invite your team with role-based permissions. Owners, managers, supervisors, salespeople — all covered." },
  { icon: Building2, title: "Multi-Branch", desc: "Manage multiple store locations from a single dashboard. Consolidated reports or branch-by-branch views." },
]

const HOW_IT_WORKS = [
  { step: "1", title: "Sign up free", desc: "Create your account in under a minute — no credit card required." },
  { step: "2", title: "Set up your shop", desc: "Add your products, create branches, and invite your team in minutes." },
  { step: "3", title: "Start selling", desc: "Record sales, track stock, manage credit, and get real-time insights from day one." },
]

const FAQ = [
  { q: "Is there a free plan?", a: "Yes. The free plan includes 1 branch, 5 users, and 100 products — enough to get started with no cost." },
  { q: "Can I manage multiple shop locations?", a: "Yes. Paid plans support multiple branches. You get a consolidated dashboard and can drill into any individual branch." },
  { q: "How is my data kept private?", a: "Each shop's data is completely isolated using Supabase Row-Level Security. No shop can ever see another shop's data." },
  { q: "Can I invite staff with limited access?", a: "Yes. You can assign roles like Branch Manager, Supervisor, and Salesperson — each with appropriate permissions." },
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

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg">ShopManager</span>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <LinkButton href="/login" variant="ghost" size="sm">Log In</LinkButton>
            <LinkButton href="/signup" size="sm">Get Started</LinkButton>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-24 pb-16 text-center">
        <Badge variant="outline" className="mb-6">Built for retail. Ready today.</Badge>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          Run your shop.<br />
          <span className="text-muted-foreground">Not spreadsheets.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          ShopManager gives small and medium retail businesses everything they need — sales, inventory, expenses, credit, and reports — in one platform. Free to start.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          <LinkButton href="/signup" size="lg">
            Get Started Free
            <ArrowRight className="ml-2 h-4 w-4" />
          </LinkButton>
          <a href="#pricing" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-all hover:bg-muted">
            See Pricing
          </a>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">No credit card required · Free plan forever</p>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Everything your shop needs</h2>
          <p className="mt-3 text-muted-foreground">From first sale to full financial overview.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <Card key={f.title} className="border">
                <CardContent className="pt-6">
                  <div className="rounded-md bg-black text-white p-2 w-fit mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-black text-white py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Up and running in minutes</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="text-center">
                <div className="text-4xl font-bold text-white/20 mb-3">{step.step}</div>
                <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-white/70 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Simple, transparent pricing</h2>
          <p className="mt-3 text-muted-foreground">Start free. Upgrade when you grow.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, i) => (
            <Card key={plan.name} className={i === 2 ? "border-2 border-black relative" : ""}>
              {i === 2 && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-black text-white">Most Popular</Badge>
                </div>
              )}
              <CardContent className="pt-6 pb-6">
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <p className="text-3xl font-bold mt-2">
                  {plan.price_monthly === 0 ? "Free" : `$${plan.price_monthly}`}
                  {plan.price_monthly > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                </p>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-black shrink-0" />{plan.max_branches} branch{plan.max_branches !== 1 ? "es" : ""}</div>
                  <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-black shrink-0" />{plan.max_users} users</div>
                  <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-black shrink-0" />{plan.max_products.toLocaleString()} products</div>
                  {(plan.feature_flags as Record<string, boolean>).advanced_reports && (
                    <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-black shrink-0" />Advanced reports</div>
                  )}
                  {(plan.feature_flags as Record<string, boolean>).stock_transfers && (
                    <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-black shrink-0" />Stock transfers</div>
                  )}
                  {(plan.feature_flags as Record<string, boolean>).audit_log && (
                    <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-black shrink-0" />Audit log</div>
                  )}
                </div>
                <LinkButton
                  href="/signup"
                  className="w-full mt-6"
                  variant={i === 2 ? "default" : "outline"}
                >
                  {plan.price_monthly === 0 ? "Get Started Free" : "Start Trial"}
                </LinkButton>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/40 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-12">What shop owners say</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Sarah A.", role: "Cold Store Owner", text: "Finally a system that makes sense for a small shop. Setup took 10 minutes and my staff picked it up instantly." },
              { name: "Michael K.", role: "Hardware Store Manager", text: "The multi-branch view is exactly what I needed. I can see all three locations in one place." },
              { name: "Priya M.", role: "Boutique Owner", text: "Credit tracking used to be in a notebook. Now it&apos;s instant and I never miss a repayment." },
            ].map((t) => (
              <Card key={t.name}>
                <CardContent className="pt-6">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-black" />)}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">&ldquo;{t.text}&rdquo;</p>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Frequently asked questions</h2>
        </div>
        <div className="space-y-4">
          {FAQ.map((item) => (
            <Card key={item.q}>
              <CardContent className="pt-4 pb-4">
                <p className="font-semibold text-sm">{item.q}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black text-white py-16 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold">Ready to run a smarter shop?</h2>
          <p className="mt-4 text-white/70">Join hundreds of shop owners who&apos;ve simplified their operations.</p>
          <LinkButton href="/signup" size="lg" variant="secondary" className="mt-8">Start for free — no card needed</LinkButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">ShopManager</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">Privacy Policy</a>
            <a href="#" className="hover:text-foreground">Terms of Service</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
          <span>© {new Date().getFullYear()} ShopManager. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
