import { createAdminClient } from "@/lib/supabase/admin"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/link-button"

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  const admin = createAdminClient()

  const { data: invite } = await admin
    .from("shop_invites")
    .select("*, shops(name)")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single()

  const pwd: string | undefined = invite?.temp_password ?? undefined

  if (!invite) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertDescription>
              This invite link is invalid or has expired.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const shopName = (invite.shops as { name: string } | null)?.name ?? "ShopManager"
  const loginUrl = `/login?email=${encodeURIComponent(invite.email)}&invite_token=${token}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve been invited</CardTitle>
        <CardDescription>
          Join {shopName} as{" "}
          <span className="font-medium capitalize">{invite.role.replace(/_/g, " ")}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Credentials box */}
        <div className="rounded-md border bg-muted/40 px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your sign-in credentials</p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Email</span>
            <span className="text-sm font-mono font-medium">{invite.email}</span>
          </div>
          {pwd && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">Temporary password</span>
              <span className="text-sm font-mono font-medium">{pwd}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Click below to sign in and activate your account. You can change your password afterwards from your profile.
        </p>

        <LinkButton href={loginUrl} className="w-full">Sign in to activate</LinkButton>
      </CardContent>
    </Card>
  )
}
