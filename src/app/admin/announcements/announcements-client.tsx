"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDate } from "@/utils/format"
import { Plus, Loader2, Megaphone } from "lucide-react"
import { toast } from "sonner"

interface Announcement {
  id: string
  title: string
  body: string
  starts_at: string
  ends_at: string | null
  created_at: string
}

export function AnnouncementsClient({ announcements }: { announcements: Announcement[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [startsAt, setStartsAt] = useState(new Date().toISOString().split("T")[0])
  const [endsAt, setEndsAt] = useState("")

  function isActive(a: Announcement) {
    const now = new Date()
    const start = new Date(a.starts_at)
    const end = a.ends_at ? new Date(a.ends_at) : null
    return start <= now && (!end || end >= now)
  }

  async function handleCreate() {
    if (!title.trim() || !body.trim()) {
      toast.error("Fill in all required fields")
      return
    }
    setLoading(true)
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, starts_at: startsAt, ends_at: endsAt || null }),
    })
    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? "Failed")
    } else {
      toast.success("Announcement created")
      setOpen(false)
      setTitle("")
      setBody("")
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Announcements</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Announcement
        </Button>
      </div>

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No announcements yet</CardContent></Card>
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Megaphone className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(a.starts_at)}{a.ends_at ? ` → ${formatDate(a.ends_at)}` : " (no end date)"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isActive(a) ? "default" : "secondary"} className="shrink-0 text-xs">
                    {isActive(a) ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Announcement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Announcement body..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Date <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={startsAt} />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Announcement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
