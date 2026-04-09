"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle } from "lucide-react"
import type { ShopType } from "@/types"

const SHOP_TYPES: { value: ShopType; label: string }[] = [
  { value: "cold_store", label: "Cold Store" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "hardware", label: "Hardware Store" },
  { value: "boutique", label: "Boutique" },
  { value: "general", label: "General Merchandise" },
  { value: "other", label: "Other" },
]

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "GHS", label: "GHS — Ghanaian Cedi" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "ZAR", label: "ZAR — South African Rand" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Step 1
  const [shopName, setShopName] = useState("")
  const [shopType, setShopType] = useState<ShopType>("general")
  const [currency, setCurrency] = useState("USD")

  // Step 2
  const [branchName, setBranchName] = useState("Main Branch")
  const [branchAddress, setBranchAddress] = useState("")

  async function handleFinish() {
    setLoading(true)
    setError("")

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName, shopType, currency, branchName, branchAddress }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? "Setup failed. Please try again.")
      setLoading(false)
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-2 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-foreground" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <CardTitle>
          {step === 1 ? "Set up your shop" : "Your first branch"}
        </CardTitle>
        <CardDescription>
          {step === 1
            ? "Tell us about your business"
            : "Every shop needs at least one branch to operate"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shopName">Shop name</Label>
              <Input
                id="shopName"
                placeholder="My Awesome Store"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shopType">Shop type</Label>
              <Select value={shopType} onValueChange={(v) => setShopType(v as ShopType)}>
                <SelectTrigger id="shopType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHOP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v ?? "")}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!shopName.trim()}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branchName">Branch name</Label>
              <Input
                id="branchName"
                placeholder="Main Branch"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchAddress">Branch address <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="branchAddress"
                placeholder="123 Main St, City"
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleFinish}
                disabled={!branchName.trim() || loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Finish setup
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
