"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

const IDLE_MS = 30 * 60 * 1000 // 30 minutes total idle time
const WARN_MS =  2 * 60 * 1000 //  2 minutes warning before sign-out

export function useIdleTimeout() {
  const router = useRouter()
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARN_MS / 1000)

  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Ref so the activity listener always sees the current value without re-subscribing
  const isWarning = useRef(false)

  const clearAll = useCallback(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current)
    if (outTimer.current)  clearTimeout(outTimer.current)
    if (tickTimer.current) clearInterval(tickTimer.current)
  }, [])

  const doSignOut = useCallback(async () => {
    clearAll()
    await fetch("/api/auth/signout", { method: "POST" })
    router.replace("/login")
  }, [clearAll, router])

  const startTimers = useCallback(() => {
    clearAll()
    isWarning.current = false
    setShowWarning(false)
    setSecondsLeft(WARN_MS / 1000)

    // Show warning 2 minutes before sign-out
    warnTimer.current = setTimeout(() => {
      isWarning.current = true
      setShowWarning(true)
      setSecondsLeft(WARN_MS / 1000)
      tickTimer.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(tickTimer.current!)
            tickTimer.current = null
            return 0
          }
          return s - 1
        })
      }, 1000)
    }, IDLE_MS - WARN_MS)

    // Sign out when full idle period elapses
    outTimer.current = setTimeout(doSignOut, IDLE_MS)
  }, [clearAll, doSignOut])

  // Sign out when the countdown ticks to 0 (belt-and-suspenders alongside the timeout above)
  useEffect(() => {
    if (secondsLeft === 0 && isWarning.current) {
      doSignOut()
    }
  }, [secondsLeft, doSignOut])

  // Attach activity listeners; only reset timers when not in warning state
  useEffect(() => {
    const onActivity = () => {
      if (!isWarning.current) startTimers()
    }
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    startTimers()
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      clearAll()
    }
  }, [startTimers, clearAll])

  return {
    showWarning,
    secondsLeft,
    staySignedIn: startTimers, // resets all timers and closes warning
    signOut: doSignOut,
  }
}
