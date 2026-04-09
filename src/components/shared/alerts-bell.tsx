"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function AlertsBell() {
  const router = useRouter()
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function fetchCount() {
      const supabase = createClient()
      const { count } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("status", "open")
      setCount(count ?? 0)
    }
    fetchCount()
  }, [])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => router.push("/alerts")}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
        >
          {count > 99 ? "99+" : count}
        </Badge>
      )}
    </Button>
  )
}
