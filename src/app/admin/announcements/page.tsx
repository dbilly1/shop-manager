import { createAdminClient } from "@/lib/supabase/admin"
import { AnnouncementsClient } from "./announcements-client"

export default async function AnnouncementsPage() {
  const admin = createAdminClient()
  const { data: announcements } = await admin.from("announcements").select("*").order("created_at", { ascending: false })
  return <AnnouncementsClient announcements={announcements ?? []} />
}
