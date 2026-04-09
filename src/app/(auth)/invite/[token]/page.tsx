"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"

export default function InvitePage() {
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const [invite, setInvite] = useState<{ email: string; shop_name?: string; role: string } | null>(null)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    async function loadInvite() {
      const res = await fetch(`/api/invite/${token}`)
      if (!res.ok) {
        setError("This invite link is invalid or has expired.")
      } else {
        const data = await res.json()
        setInvite(data)
      }
      setFetching(false)
    }
    loadInvite()
  }, [token])

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    setError("")

    const res = await fetch(`/api/invite/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to accept invite")
      setLoading(false)
      return
    }

    // Sign in with new credentials
    const supabase = createClient()
    await supabase.auth.signInWithPassword({ email: invite!.email, password })
    router.push("/dashboard")
    router.refresh()
  }

  if (fetching) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  if (!invite) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertDescription>{error || "Invalid invite link."}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve been invited</CardTitle>
        <CardDescription>
          Join {invite.shop_name ?? "ShopManager"} as{" "}
          <span className="font-medium capitalize">{invite.role.replace(/_/g, " ")}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAccept} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={invite.email} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Set your password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept invite & sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
