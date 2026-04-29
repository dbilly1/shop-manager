# ShopManager

Multi-tenant retail-operations platform — sales, inventory, expenses, reconciliation, transfers, credit, reports — with branch-aware role-based access. Built on Next.js 16 (App Router), React 19, Supabase, Stripe, Tailwind 4 + shadcn/ui.

---

## Tech stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui, recharts |
| Auth & DB | Supabase (Postgres + RLS + Auth + Edge Functions) |
| Payments | Stripe (subscriptions + webhooks) |
| Email | Resend |
| Forms | react-hook-form + zod |

---

## Getting started

### 1. Prerequisites

- Node 20+
- A Supabase project (free tier works)
- Stripe test keys (only needed if working on billing)
- (Optional) A Resend account for sending invite emails

### 2. Clone and install

```bash
git clone <repo>
cd shop-manager
npm install
```

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in the values. **Important gotchas:**

- The `SUPABASE_SERVICE_ROLE_KEY` is the JWT-format service-role key (starts with `eyJ`), not the personal access token / `sb_secret_…` format.
- Do **not** add inline `# comments` or trailing whitespace to env values — Next.js includes them in the value.
- `NEXT_PUBLIC_APP_URL` must have no trailing slash.

### 4. Database

Run the SQL files in `supabase/` in order:

```bash
# In Supabase Dashboard → SQL Editor
# 1) Run supabase/schema.sql once
# 2) Run each file in supabase/migrations/ in order (001, 002, …)
```

Or with the Supabase CLI:

```bash
supabase db reset    # if local
supabase db push     # if remote
```

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>. Sign up to create a shop owner account, complete onboarding, and you're in.

---

## Project structure

```
src/
├── app/
│   ├── (app)/                  # Authenticated app shell — owner / managers / staff
│   │   ├── layout.tsx          # Server component, fetches shop/branches/announcements
│   │   ├── app-shell.tsx       # Client wrapper (contexts, branch switcher)
│   │   ├── dashboard/          # Branch + consolidated dashboards
│   │   ├── sales/              # Sales list, new sale, bulk sale, day detail
│   │   ├── inventory/          # Stock per branch, restocking
│   │   ├── adjustments/        # Stock corrections (with approval flow)
│   │   ├── transfers/          # Inter-branch stock transfers
│   │   ├── expenses/           # Per-branch expense logging
│   │   ├── reconciliation/     # Daily cash/till reconciliation
│   │   ├── credit/             # Customer credit accounts
│   │   ├── customers/          # Customer directory
│   │   ├── reports/            # P&L-style reports
│   │   ├── alerts/             # Low-stock + reconciliation alerts
│   │   ├── audit/              # Audit log viewer
│   │   ├── users/              # Staff invitations + management
│   │   └── settings/           # Shop preferences, billing
│   ├── (auth)/                 # Public auth pages
│   │   ├── login/
│   │   ├── signup/
│   │   ├── onboarding/         # First-time shop setup
│   │   └── invite/[token]/     # Invitation acceptance
│   ├── admin/                  # Super-admin panel (separate role)
│   ├── api/                    # Route handlers
│   │   ├── auth/signout/
│   │   ├── adjustments/approve/
│   │   ├── transfers/approve/
│   │   ├── invite/[token]/     # Public invite validation + acceptance
│   │   ├── users/invite/       # Authenticated invite create / resend / cancel
│   │   ├── onboarding/
│   │   ├── webhooks/stripe/
│   │   └── admin/              # Super-admin endpoints
│   ├── error.tsx               # (per route group)
│   ├── not-found.tsx
│   └── global-error.tsx
├── components/
│   ├── layout/                 # Sidebar, top nav
│   ├── shared/                 # Cross-feature shared components
│   └── ui/                     # shadcn primitives
├── hooks/
│   ├── useSession.ts           # Authenticated session context
│   └── useBranch.ts            # Selected-branch context
├── lib/
│   ├── supabase/
│   │   ├── server.ts           # Server component client
│   │   ├── client.ts           # Browser client
│   │   ├── admin.ts            # Service-role client (server-only)
│   │   └── middleware.ts       # Session refresh + route guards
│   ├── session.ts              # getSessionContext() helper
│   ├── permissions.ts          # canDoX(role) functions
│   ├── auth-guard.ts           # requireRole() / requireSuperAdmin() for API routes
│   ├── branch-cookie.ts        # Read selected branch on server
│   ├── email.ts                # Resend wrapper
│   └── constants.ts            # Magic numbers / supported currencies
├── middleware.ts               # Top-level Next.js middleware
├── types/index.ts              # Shared types (SessionContext, Role, etc.)
└── utils/                      # format, boxes, etc.

supabase/
├── schema.sql                  # Tables, RLS policies, RPC functions
└── migrations/                 # Numbered, additive
```

---

## Roles & permissions

Defined in `src/lib/permissions.ts`.

| Role | Scope | Highlights |
|------|-------|-----------|
| `super_admin` | Platform | Manage shops, plans, announcements |
| `owner` | Shop | Everything within their shop incl. billing |
| `general_manager` | Shop | Everything except billing |
| `general_supervisor` | Shop | Read-only consolidated view + ops |
| `branch_manager` | Branch | Full ops for their branch incl. invites |
| `branch_supervisor` | Branch | Read-only + reconciliation |
| `salesperson` | Branch | Record sales only |

---

## Key data flow

### Branch scoping

Every page reads `getActiveBranchId(session.branch_id)` from `src/lib/branch-cookie.ts`:

- Branch-scoped users (`branch_manager`, `salesperson`, etc.) → always returns their `branch_id`.
- Shop-level users (`owner`, `general_manager`) → returns the value of the `sm_branch` cookie set from the top-nav switcher, or `null` for "All branches".

Queries that should be branch-filtered apply `if (activeBranchId) query.eq("branch_id", activeBranchId)`. The pattern is consistent across every list page.

### Sale creation (atomic)

`create_sale_with_items` Postgres RPC (migration 009) wraps:
1. Insert `sales`
2. Insert `sale_items` per line
3. Validate stock → raise on insufficient
4. Decrement `branch_products.current_stock_*` atomically
5. Insert `credit_sales` if `payment_method = 'credit'`

All in one transaction. Client just calls `supabase.rpc("create_sale_with_items", { … })`.

### Invite flow

1. Inviter fills email, role, branch, generates a temp password (`generatePassword()` uses `crypto.getRandomValues`).
2. POST `/api/users/invite` → creates the Supabase auth user (or updates existing) with the temp password and `email_confirm: true`, inserts `shop_invites` row with `temp_password` stored.
3. Invitee opens the invite link `/invite/<token>` — server-side validates the token, displays the email + temp password.
4. Invitee clicks "Sign in to activate" → `/login?email=…&invite_token=…`.
5. Login form pre-fills email; user types temp password.
6. After successful sign-in, the form POSTs to `/api/invite/<token>/accept` which uses the **signed-in user's session** to upsert `shop_members` and clears `temp_password`.

The temp password is **never** in the URL.

---

## Scripts

```bash
npm run dev      # dev server with HMR
npm run build    # production build
npm run start    # production server (after build)
npm run lint     # eslint
```

---

## Deploying

Recommended: **Vercel** (Next.js native).

1. Push to GitHub.
2. Import in Vercel.
3. Set environment variables (same list as `.env.example`).
4. Deploy.

Stripe webhook URL: `https://<your-domain>/api/webhooks/stripe`. Configure in Stripe Dashboard → Developers → Webhooks. Subscribe to:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

For invite emails to actually send in production, verify your sending domain in Resend.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Branch switch shows blank white screen | Old client-side layout — should be fixed; if it returns, check that `(app)/layout.tsx` is a server component. |
| Invite link page is stuck loading | Old code path. The page is now a server component. |
| "Invalid login credentials" after invite accept | "Confirm email" is enabled in Supabase Auth → Email; turn it off (invites are pre-verified by token). |
| Stripe webhook 401 | `STRIPE_WEBHOOK_SECRET` not set or doesn't match the dashboard. |
| Invite email not sent (dev) | `RESEND_API_KEY` missing — invite link is logged to the console instead. |
| 401 on every API call | Middleware not running. Confirm `src/middleware.ts` exists (not `proxy.ts`). |

---

## Review notes

A line-by-line audit lives in [`PROJECT-REVIEW.md`](./PROJECT-REVIEW.md). The corresponding fixes are tracked in this commit; remaining items are documented there.
