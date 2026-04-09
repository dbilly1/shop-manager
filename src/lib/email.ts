import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.RESEND_FROM_EMAIL ?? "ShopManager <noreply@shopmanager.app>"

export async function sendInviteEmail({
  to,
  inviteLink,
  shopName,
  role,
  invitedByName,
}: {
  to: string
  inviteLink: string
  shopName: string
  role: string
  invitedByName?: string
}) {
  if (!resend) {
    console.log(`[INVITE EMAIL] To: ${to} | Link: ${inviteLink}`)
    return
  }

  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  const inviterText = invitedByName ? ` by ${invitedByName}` : ""

  await resend.emails.send({
    from: FROM,
    to,
    subject: `You've been invited to ${shopName} on ShopManager`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <h1 style="font-size: 20px; margin-bottom: 8px;">You've been invited${inviterText}</h1>
        <p style="color: #555; margin-bottom: 24px;">
          You've been invited to join <strong>${shopName}</strong> as a <strong>${roleLabel}</strong>.
          Click the button below to accept your invite and set up your account.
        </p>
        <a href="${inviteLink}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Accept Invite
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
          This invite expires in 72 hours. If you didn't expect this, you can safely ignore it.
        </p>
      </div>
    `,
  })
}
