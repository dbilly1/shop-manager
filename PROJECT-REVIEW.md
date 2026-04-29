# Shop Manager — Project Review

A holistic audit of the codebase as of the current commit. Findings are grouped by severity. Each item includes **what's wrong**, **why it matters**, and **a concrete fix**.

---

## TL;DR — top 5 things to fix first

1. **`src/proxy.ts` is not actually wired up as middleware** — Next.js looks for `src/middleware.ts`. Your auth/route protection code is dead. *(Critical security)*
2. **Sale creation is not atomic** — sale insert, sale_items insert, stock decrement, and credit-sale insert run as 4 separate client-side requests. A failure or refresh mid-way leaves orphaned/inconsistent data. Stock decrement also has a **race condition** — concurrent sales over-sell. *(Critical data integrity)*
3. **`src/app/(app)/layout.tsx` is a fully client-side component** — every navigation re-runs auth, fetches the shop, branches, announcements client-side. This causes the white-spinner-on-branch-switch issue and adds a per-page round-trip cost. *(High UX/perf)*
4. **The admin-users invite flow leaks the temp password into the URL** (`?pwd=…`). It shows up in browser history, server logs, and any referer headers. *(Medium security)*
5. **No middleware-level route protection** — any logged-out user can hit `/dashboard`, `/sales`, etc. The pages do `redirect("/login")` server-side which works, but admin pages (`/admin/*`) only check `super_admin` *inside* the page; a TOCTOU window exists, and any failure to add the check on a new admin page exposes data. *(High security)*

---

## CRITICAL — Fix immediately

### C1. ~~Middleware file is misnamed~~ — RETRACTED

**Original claim:** `src/proxy.ts` doesn't run because Next.js looks for `middleware.ts`.

**Correction:** Next.js 16 has *renamed* the convention. `proxy.ts` exporting a `proxy` function IS the new name. The auth/route-protection code WAS running. My initial review was based on Next.js 13–15 conventions and was wrong here. The build output confirms `ƒ Proxy (Middleware)`.

**Action taken:** Restored the original `src/proxy.ts`. Extended `src/lib/supabase/middleware.ts` to also guard `/admin/*` server-side as defence-in-depth.

```ts
// src/middleware.ts
import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

After fixing this, also extend the middleware to **block `/admin/*` for non-super-admins** server-side.

---

### C2. Sale creation is not atomic & has a stock-update race

**File:** `src/app/(app)/sales/new/new-sale-form.tsx` (lines 110–200)

The flow is:
1. Insert into `sales` (client-side)
2. Insert into `sale_items` (client-side)
3. Loop over items, `UPDATE branch_products SET current_stock_kg = <client-computed-new-value>` (client-side, per item)
4. Insert into `credit_sales` if applicable (client-side)

**Two distinct problems:**

#### a) Not atomic
If the page reloads, network drops, or any of steps 2–4 fails, you get:
- `sales` row with no `sale_items` (zombie sale)
- `sale_items` without stock decrement (over-counts inventory)
- A successful sale with no `credit_sales` row (customer never billed)

#### b) Race condition in stock update
The decrement uses `bp.current_stock_kg - l.quantity` where `bp.current_stock_kg` is the value the **client read at page load**. If two cashiers each load the form when stock = 10 and each sells 6, both will write `stock = 4` instead of correctly going negative or the second one failing.

**Fix:** Move the entire sale into a Postgres function (RPC) that runs in a transaction:

```sql
create or replace function public.create_sale_with_items(
  p_sale jsonb,           -- { shop_id, branch_id, sale_date, total_amount, payment_method, customer_id, recorded_by }
  p_items jsonb           -- [{ product_id, branch_product_id, quantity_kg, quantity_units, ..., unit_price, discount_amount, line_total, cost_price_at_sale }, ...]
) returns uuid
language plpgsql
security definer
as $$
declare
  v_sale_id uuid;
  v_item jsonb;
begin
  insert into sales (...) values (...) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items (...) values (...);

    -- Atomic decrement with constraint
    update branch_products
       set current_stock_kg    = current_stock_kg    - (v_item->>'quantity_kg')::numeric,
           current_stock_units = current_stock_units - (v_item->>'quantity_units')::numeric,
           current_stock_boxes = current_stock_boxes - (v_item->>'quantity_boxes')::numeric,
           updated_at = now()
     where id = (v_item->>'branch_product_id')::uuid;
  end loop;

  if p_sale->>'payment_method' = 'credit' then
    insert into credit_sales (...) values (...);
  end if;

  return v_sale_id;
end;
$$;
```

Then call `supabase.rpc("create_sale_with_items", { p_sale, p_items })` from the form. You already use this pattern for `approve_stock_transfer` and `approve_stock_adjustment` — apply it consistently.

The same problem exists in `bulk-sale-form.tsx` — fix it there too.

---

### C3. `src/app/(app)/layout.tsx` is fully client-rendered

**File:** `src/app/(app)/layout.tsx`

The whole protected app shell does this client-side in a `useEffect`:
- `getUser()`
- check super-admin
- query `shop_members`
- redirect logic
- query `shops`, `branches`, `announcements`
- read `sm_branch` cookie
- set CSS custom properties

**Problems:**
- Every navigation flashes a spinner (`if (loading) return <Spinner />`).
- Branch switch needs `window.location.reload()` because there's no clean way to invalidate the in-memory data.
- Auth check happens in the browser — a flash of unauthenticated content is technically possible.
- The four sequential awaits compound latency (200–600ms typical).

**Fix:** Convert to a server component. The pattern:

```tsx
// src/app/(app)/layout.tsx — server component
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "./app-shell"  // new client component for interactivity

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (session.is_super_admin) redirect("/admin/dashboard")

  const supabase = await createClient()
  const [{ data: shop }, { data: branches }, { data: announcements }] = await Promise.all([
    supabase.from("shops").select("*").eq("id", session.shop_id!).single(),
    supabase.from("branches").select("*").eq("shop_id", session.shop_id!).eq("status", "active").order("name"),
    supabase.from("announcements").select("*").lte("starts_at", new Date().toISOString()).or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`),
  ])

  return (
    <AppShell session={session} shop={shop} branches={branches ?? []} announcements={announcements ?? []}>
      {children}
    </AppShell>
  )
}
```

Branch switch becomes `router.refresh()` (no full reload), no spinner, smooth UX.

---

### C4. Admin routes have no middleware-level protection

**Pages:** everything under `src/app/admin/*`

The `admin/layout.tsx` and individual pages each call `getSessionContext()` and check `is_super_admin`. If you forget to add that check on a new admin page, the data leaks. There's no defence-in-depth.

**Fix:** Once C1 is resolved, add to the middleware:

```ts
if (pathname.startsWith("/admin")) {
  // already-authed user check
  if (!user) return NextResponse.redirect(new URL("/login", request.url))
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!superAdmin) return NextResponse.redirect(new URL("/dashboard", request.url))
}
```

---

## HIGH — Significant problems

### H1. Temp password leaks into the invite URL

**File:** `src/app/api/users/invite/route.ts`

```ts
const inviteLink = `${appUrl}/invite/${token}?pwd=${encodeURIComponent(temp_password)}`
```

Issues:
- Browser history retains the password.
- Server access logs typically log query strings.
- If the invitee ever clicks an external link from the invite page, the URL leaks via `Referer`.
- Anyone who can read the inviter's clipboard or chat message gets full credentials.

**Fix:** Don't put the password in the URL. Two viable approaches:

1. **Store the temp password on the invite record** (encrypted at rest, since Supabase already encrypts the DB). Add a `temp_password_hash` column and store the plaintext only long enough to derive an HMAC-keyed token in the URL. Or, more simply, store the plaintext (it's already short-lived and one-time-use).
2. **Two-factor delivery** — the invite link contains only the token; the inviter is shown the password in the dialog and tells the invitee out-of-band (SMS, in person). The invite page reads from the DB.

Approach 1 is the smaller change: add column → in invite-creation save it → in the invite page select it → strip it after acceptance.

---

### H2. Stock can go negative silently in adjustments

**File:** `src/app/(app)/sales/new/new-sale-form.tsx` line 178–180

```ts
update.current_stock_kg = Math.max(0, bp.current_stock_kg - l.quantity)
```

`Math.max(0, …)` *clamps* the value. So if the cashier sells more than is in stock, the system silently records the sale and shows stock = 0 — the over-sale is invisible. There's no warning, no failure, no audit trail.

**Fix:** In the RPC mentioned in C2, raise an exception when the result would be negative:

```sql
if (current_stock_kg < quantity_kg) then
  raise exception 'Insufficient stock for product %', product_name;
end if;
```

The form should also do an optimistic check before submit and disable lines that exceed available stock.

---

### H3. `listUsers({ perPage: 500 })` will silently break at 501 users

**Files:** `src/app/api/users/invite/route.ts`, `src/app/(app)/adjustments/page.tsx`

```ts
const { data: listData } = await admin.auth.admin.listUsers({ perPage: 500 })
const existing = listData?.users?.find((u) => u.email === email)
```

This works for small shops but silently fails for larger ones — if the user is on page 2, they won't be found, the inviter creates a duplicate auth user (which fails), and the route returns a misleading error.

**Fix:** Don't iterate auth users. Use the database directly via a small RPC or query the `auth.users` view from the admin client:

```ts
const { data: u } = await admin.schema("auth").from("users").select("id").eq("email", email).maybeSingle()
```

(Verify the schema accessor works in your SDK version, otherwise create a SQL function.)

---

### H4. RLS not visible in the review — verify it's on

I didn't see RLS policies enumerated. With the **service role key** correctly set now, all admin-client queries bypass RLS — that's expected. But the **regular client-side and server-side `createClient()`** calls (in pages like `inventory/page.tsx`) rely on RLS to scope `shop_id` correctly. If RLS is off or misconfigured, a user could `select * from sales` and see other shops' data.

**Action:** Confirm:
1. RLS is `enabled` on every table (sales, sale_items, branch_products, expenses, customers, credit_sales, reconciliations, shop_members, shop_invites, branches, products, etc.).
2. Each table has a policy of the form `using (shop_id = public.get_my_shop_id())` or equivalent.
3. The `super_admins` table has a policy that only the row's own user can select it.
4. The `shop_invites` table: a non-member must NOT be able to read other shops' invites — but the invite-validation API uses the admin client, so this is fine *as long as* you never expose a public select to anon.

---

### H5. Pervasive use of `as any` masks type errors

**Locations:** `sales/page.tsx:79`, `adjustments/page.tsx:70`, `reports/page.tsx:62`, `settings/page.tsx:42`, `admin/users/page.tsx:31-32`, `inventory-client.tsx`-related joins.

These are all places where Supabase's nested-select types are awkward. `as any` defeats type-checking and means a column rename in the DB will silently break the page.

**Fix:** Generate Supabase types (`supabase gen types typescript`) and import the row types properly. For nested selects, use the patterns from `@supabase/postgrest-js` (e.g., `Tables<'sales'> & { sale_items: Tables<'sale_items'>[] }`).

---

### H6. `router.refresh()` after every mutation is wasteful

22 files use `router.refresh()` or `window.location.reload()`. After every insert/update/delete, the entire page re-fetches. This is the simplest pattern but:
- Doubles the latency of every mutation (perceived).
- Costs extra Supabase requests on the free tier.
- Blocks UI on slow networks.

**Fix:** For most mutations the existing client component already has the data — update local state optimistically (you've started this for invites, expenses, sales) and only `router.refresh()` if you need other pages to be in sync. Reserve full reloads for genuinely cross-cutting state changes.

---

## MEDIUM — Quality issues

### M1. The auth layout uses inline styles instead of Tailwind

**File:** `src/app/(auth)/layout.tsx`

400 lines of `style={{...}}` and a giant inline `<style>` block. The rest of the app uses Tailwind + shadcn. This is a maintenance burden — colour palette duplication, no theming, no responsive utilities.

**Fix:** Port the auth styles to Tailwind + the existing shadcn `Card`/`Input`/`Button`. Use the same theme tokens as the app for consistency.

---

### M2. `.env.local` previously had inline `# comments` and trailing spaces

Already fixed in this session, but worth adding to a README so it doesn't regress when a teammate edits it. Consider adding a `.env.example` with documented variables.

---

### M3. The Stripe webhook does not verify shop ownership

**File:** `src/app/api/webhooks/stripe/route.ts`

```ts
const shopId = sub.metadata?.shop_id
```

Trusting the metadata is fine *if* you set it, but there's no validation that the `customer.subscription.created` you receive actually maps to a shop you control. If anyone could create a Stripe customer with arbitrary metadata pointing to your shop ID, they could overwrite your subscription state. Stripe's webhook signature mitigates this, but the `customer.id` should be cross-checked against `shops.stripe_customer_id`.

---

### M4. No error boundaries / global error handling

If any client component throws, the page crashes with the Next.js default error UI. Consider adding `error.tsx` per route group at minimum.

---

### M5. Inconsistent error messages

Some routes return `{ error: "..." }`, some return raw Supabase error messages (which can leak schema info: `column "xyz" of relation "sales" does not exist`). Standardize: log the raw error server-side, return a curated user-facing message.

---

### M6. Many pages do N+1 queries

E.g., `adjustments/page.tsx` fetches `adjustments`, then calls `admin.auth.admin.listUsers()` separately to map adjuster IDs → names. Same pattern in admin pages. This is fine at small scale but should ultimately be done via a SQL view or join.

---

### M7. Permissions check on the server is bypassable

`canManageStaff(role)` etc. are *checked in the page component*, but a malicious user could call the API directly. The invite-creation API does check `caller.role`, but several other endpoints (e.g., `auth/signout`, future ones) don't. Add a `requireRole()` helper used by every API route.

---

### M8. The middleware (once enabled) doesn't refresh the session response

`src/lib/supabase/middleware.ts` calls `getUser()` for the redirect logic but only returns `supabaseResponse` from the *initial* `NextResponse.next({ request })`. If `setAll` was called during `getUser()` (refreshing the session cookie), the response is rebuilt — looks correct on inspection. But add a comment explaining the dance because it's subtle and easy to break.

---

### M9. Currency is a free-text string

`shops.currency` is a string like `"USD"`, `"NGN"`, etc. There's no normalization (`USD` vs `usd`), no validation, no symbol mapping. `formatCurrency` likely handles only common ones. Consider an enum / lookup table or use Intl.NumberFormat consistently.

---

### M10. Magic numbers and hardcoded thresholds

- 90 days hardcoded in `sales/page.tsx`
- 200 entries in expenses
- `perPage: 500` for `listUsers`
- 72-hour invite expiry but the email and one comment say 48 hours

Move to a `src/lib/constants.ts`.

---

## LOW — Nits and polish

### L1. Dead `proxy.ts` file's matcher excludes nothing useful

After C1 is fixed, the matcher should also exclude `/api/webhooks/stripe` to avoid CPU on every webhook hit, and explicitly list public routes instead of inferring them.

### L2. `Math.random()` for password generation is not cryptographically secure

In `users-client.tsx`'s `generatePassword()`. Browser-generated short-lived temp passwords are probably fine, but `crypto.getRandomValues()` is one line away.

```ts
const buf = new Uint32Array(10)
crypto.getRandomValues(buf)
// then map to chars
```

### L3. No README for getting the project running

Newcomers have no doc on env vars, Supabase setup, or migration order.

### L4. Unused state setter `setOpen` in some dialogs

After conversion to optimistic state, double-check that legacy refs are removed (e.g., I noticed earlier the `Boxes` icon import was orphaned for a while).

### L5. `formatCurrency` / `formatRole` etc. are colocated with utils but not tested

A few unit tests on these would catch regressions cheaply.

### L6. Tab indices and form keyboard traps

Several dialogs (invite, expense edit) don't auto-focus the first field. Minor UX friction.

### L7. Accessibility

- Many `<button>`s with only an icon lack `aria-label` (some have `title=`, which isn't equivalent for screen readers).
- Toast messages aren't announced via `role="status"`.
- Color-only indicators (red/green badges for status) — add an icon or text.

### L8. Dashboard stat card colours

The shop primary colour is dynamically injected. If a shop sets a near-white primary, contrast will fail WCAG. Constrain the picker to colours with sufficient contrast or auto-darken.

### L9. `recharts` is a heavy dependency for a single chart

If only the dashboard uses it, lazy-load it. Saves ~80KB on initial bundle for non-dashboard pages.

### L10. The `shop-manager` workspace has no CI

No `.github/workflows`, no pre-commit hooks beyond what `package.json scripts` show. Add a CI step that runs `npm run lint` and (eventually) `npm run build` and `tsc --noEmit`.

---

## Architectural observations

### A1. Branching/multi-tenancy is consistent but undocumented

The pattern is: `shop_members.shop_id` scopes everything, `branch_id` (nullable for shop-level users) further scopes branch-bound ones. The `getActiveBranchId(session.branch_id)` helper centralises this nicely. **Document this** in a `docs/data-model.md` so future contributors don't reinvent it.

### A2. Server vs client component split is reasonable but inconsistent

Most `page.tsx` are server components doing data fetching → pass data as props to `*-client.tsx`. Good pattern. Exceptions: `(app)/layout.tsx` (the big one in C3), `(auth)/login/page.tsx`, `(auth)/signup/page.tsx`, `(auth)/onboarding/page.tsx` — these are all `"use client"` doing their own data work. Consider migrating where it makes sense.

### A3. `shop_invites` and `shop_members` co-existing is fine but the lifecycle is tangled

The new flow creates an auth user *and* an invite *and* expects the user to sign in, which then activates the membership. There are 3 states (invite pending, invite expired, invite accepted) that need to stay in sync with `shop_members.status`. Worth a simple state diagram in docs.

### A4. No background jobs

Everything runs in-request. Reconciliation reminders, expired invite cleanup, low-stock alerts — these are all polled via UI. A scheduled job (Supabase Edge Function on a cron, or Vercel cron) would be cleaner.

---

## Priority-ordered action list

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | C1: rename `proxy.ts` → `middleware.ts` | 5 min | Critical |
| 2 | C4: middleware `/admin/*` guard | 15 min | High |
| 3 | C2: atomic `create_sale_with_items` RPC | 2–4 h | Critical |
| 4 | H2: insufficient-stock exception in the RPC | (rolled into C2) | High |
| 5 | H1: remove `?pwd=` from invite URL | 30 min + DB col | Medium-High |
| 6 | C3: convert `(app)/layout.tsx` to a server component | 2–3 h | High UX |
| 7 | H4: audit RLS policies | 1–2 h | Critical (if not yet done) |
| 8 | H3: replace `listUsers({ perPage: 500 })` | 30 min | Medium |
| 9 | H5: generate Supabase types, kill `as any` | 1 h | Medium |
| 10 | M7: `requireRole()` helper for API routes | 1 h | High |
| 11 | M9, M10: extract constants and validate currencies | 30 min | Low |
| 12 | L3: write a README | 30 min | Low |

---

## Things you're doing well

- Server-component pages with client-component interactivity is the right pattern.
- The `getActiveBranchId` cookie helper centralises a tricky concern cleanly.
- Atomic RPCs for `approve_stock_transfer` / `approve_stock_adjustment` show you know the pattern — just need to apply it to sales.
- The role/permission split is granular and consistent.
- `getSessionContext()` is a clean abstraction over auth + membership.
- Optimistic local state for invite cancellation is the right direction.
- The repository structure is clean — feature-based with shared `components/ui`.

---

*Generated as a snapshot review. Re-run after addressing the Critical items to surface the next layer of issues.*
