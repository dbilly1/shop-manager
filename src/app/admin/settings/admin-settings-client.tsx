"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/shared/stat-card"
import { Building2, Users, CreditCard, Mail, Key, Webhook } from "lucide-react"

interface Props {
  stats: {
    totalShops: number
    totalUsers: number
    activeSubscriptions: number
  }
}

const envVars = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase Anon Key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Service Role Key" },
  { key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key" },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe Webhook Secret" },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", label: "Stripe Publishable Key" },
  { key: "RESEND_API_KEY", label: "Resend API Key (email)" },
  { key: "NEXT_PUBLIC_APP_URL", label: "App URL" },
]

export function AdminSettingsClient({ stats }: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Platform Settings</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Total Shops" value={String(stats.totalShops)} icon={<Building2 className="h-4 w-4" />} />
        <StatCard title="Active Users" value={String(stats.totalUsers)} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Active Subscriptions" value={String(stats.activeSubscriptions)} icon={<CreditCard className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="h-4 w-4" />
            Environment Configuration
          </CardTitle>
          <CardDescription>Status of required environment variables. Set these in your hosting provider or .env.local.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {envVars.map((v) => (
              <div key={v.key} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{v.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{v.key}</p>
                </div>
                <Badge
                  variant={process.env[v.key] ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {process.env[v.key] ? "Set" : "Not set"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Integration Endpoints
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {[
              { label: "Stripe Webhook", path: "/api/webhooks/stripe", description: "Configure in Stripe dashboard → Webhooks" },
              { label: "Invite Accept", path: "/api/invite/[token]/accept", description: "Called when a user accepts an invite" },
            ].map((ep) => (
              <div key={ep.path} className="py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{ep.label}</p>
                  <Badge variant="outline" className="text-xs font-mono">{ep.path}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ep.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email (Resend)
          </CardTitle>
          <CardDescription>
            Invite emails are sent via Resend. Set <code className="text-xs bg-muted px-1 rounded">RESEND_API_KEY</code> and
            {" "}<code className="text-xs bg-muted px-1 rounded">RESEND_FROM_EMAIL</code> to enable.
            Without these, invite links are logged to the server console only.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
