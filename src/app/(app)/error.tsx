"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[App error boundary]", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            {error.message || "An unexpected error occurred. Please try again."}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button onClick={reset} className="flex-1">Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")} className="flex-1">
            Back to dashboard
          </Button>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground text-center">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
