import { LinkButton } from "@/components/ui/link-button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md text-center space-y-6">
        <div>
          <p className="text-6xl font-bold text-muted-foreground/40">404</p>
          <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <div className="flex gap-2 justify-center">
          <LinkButton href="/dashboard">Go to dashboard</LinkButton>
          <LinkButton href="/" variant="outline">Home</LinkButton>
        </div>
      </div>
    </div>
  )
}
