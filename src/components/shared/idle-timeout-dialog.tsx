"use client"

import { Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useIdleTimeout } from "@/hooks/useIdleTimeout"

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`
  return `${s}s`
}

export function IdleTimeoutDialog() {
  const { showWarning, secondsLeft, staySignedIn, signOut } = useIdleTimeout()

  return (
    <Dialog open={showWarning}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <DialogTitle>Session Expiring</DialogTitle>
          </div>
          <DialogDescription>
            You've been inactive for a while. For your security, you'll be automatically
            signed out in{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatCountdown(secondsLeft)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={signOut}>
            Sign Out Now
          </Button>
          <Button onClick={staySignedIn}>
            Stay Signed In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
