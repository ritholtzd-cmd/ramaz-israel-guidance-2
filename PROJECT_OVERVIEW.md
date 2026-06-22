# Israel Guidance Booking — Project Overview

A booking website for the Ramaz Upper School Israel Guidance department. Outside
programs (yeshivas, seminaries, gap-year programs) book a presentation slot on a
public page; staff manage bookings through a password-protected admin view. It
replaces the department's paid Setmore subscription.

- **Public site:** https://ramaz-israel-guidance-2.vercel.app
- **Admin:** `/admin` on the same domain (shared password)
- **Source:** https://github.com/ritholtzd-cmd/ramaz-israel-guidance-2

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, hosted on **Vercel** (static SPA) |
| Database | **Supabase** (PostgreSQL) |
| Server logic | **Supabase Edge Functions** (Deno/TypeScript) |
| Transactional email | **Resend** API + an `.ics` calendar attachment |
| Bot protection | **Cloudflare Turnstile** |

The browser only ever uses Supabase's **anonymous (publishable) key**, which can
read public availability but cannot read bookings. All writes and all access to
personal data go through Edge Functions using the **service-role key**, which
never reaches the browser.

```
Browser (React)
  ├─ reads open slots & settings        → Supabase REST (anon key, RLS-limited)
  ├─ submits a booking                  → Edge Function: create-booking
  └─ /admin actions                     → Edge Function: admin-bookings (password)
Edge Functions (service role)
  ├─ create_booking() SQL function      → atomic slot claim + insert
  ├─ Resend API                         → confirmation email + staff invite
  └─ request_log                        → audit trail
```

---

## Data model (PostgreSQL)

- **`slots`** — bookable inventory. `starts_at`/`ends_at` (timestamptz), `status`
  (`open` | `booked` | `blocked`). One presentation per slot.
- **`bookings`** — `program_name`, `program_types` (Seminary/Yeshiva/Other),
  contact name/email/phone, presenter name/email/phone, `bringing_alum`,
  `av_needs`, `status` (`booked` | `cancelled`), timestamps.
- **`settings`** — single row: location, contact info, "what to expect" copy, and
  `email_enabled` (the outbound-email kill switch).
- **`request_log`** — audit trail of every booking submission: IP, action,
  result, email status, timestamp. Powers rate limiting and monitoring.

### Double-booking guarantee
Bookings are created only via the `create_booking()` `SECURITY DEFINER` function,
which in **one transaction** does a conditional `UPDATE slots SET status='booked'
WHERE id=? AND status='open'` and then inserts the booking. If the slot was
already taken, zero rows update and the whole transaction aborts — two programs
can never win the same slot. A partial unique index on `bookings(slot_id) WHERE
status='booked'` is a second backstop.

### Row Level Security
RLS is enabled on every table. Anon may `SELECT` `slots` and `settings` only.
**`bookings` and `request_log` have no anon policy** — they're unreadable from
the browser. The service role (Edge Functions) bypasses RLS for writes/admin.

---

## Availability model (extensible)

Availability is read through a single module — `src/lib/availability/` — that the
rest of the app depends on. Today it's backed by a **static provider** reading
seeded slots from the database. Slots were generated from the 2026–27 school
calendar and bell schedule (weekdays only; holidays, breaks, and finals excluded;
all times in America/New_York, rounded to 5 minutes).

To later drive availability from a school system (Veracross / Axiom / a calendar
API), a new provider implementing the same `listAvailableSlots()` interface is
dropped in and one import line changes — no rewrite. This seam is documented in
`src/lib/availability/index.js`.

---

## Email + calendar

On a successful booking the `create-booking` function sends, via Resend:
1. A **confirmation** to the booking contact (date, time, location, presenter).
2. A **staff notification** to the Israel Guidance team.

Both carry an `.ics` attachment so any calendar app (Outlook, Google, Apple) can
add the event with one click — no Google/OAuth integration required.

**Sending domain:** currently in Resend test mode (`onboarding@resend.dev`,
delivers only to the account owner). Production will send from a dedicated
subdomain (e.g. `send.ramaz.org`) once IT provisions the DNS records (SPF/DKIM)
— keeping application mail fully separate from the primary Ramaz M365 environment.

---

## Security controls

- **Cloudflare Turnstile (CAPTCHA)** on the booking form; the server verifies the
  token before accepting a submission.
- **Rate limiting** — per-IP limits (5/hour, 20/day) enforced in the Edge Function
  via `request_log`.
- **Server-side validation** — required fields, email format, length caps, and an
  allow-list for program type. The browser is never trusted.
- **Audit logging** — every submission and its email outcome is recorded.
- **Email kill switch** — `settings.email_enabled`, toggled from the admin page,
  immediately halts all outbound mail without taking the site down.
- **Secret isolation** — service-role key, Resend key, admin password, and
  Turnstile secret live only as Edge Function secrets, never in the client bundle.

---

## Admin

`/admin` is gated by a shared password (an Edge Function secret). Staff can:
list all bookings, **add** a booking manually (e.g. one taken off-platform),
**edit** a booking's details, **cancel** (which reopens the slot), **download CSV**
(opens in Google Sheets; imports into Schoology/Veracross/Axiom), and toggle the
**email kill switch**. Add/edit include a "send confirmation email?" choice so a
quiet correction doesn't email the program.

---

## Configuration

**Frontend env (Vercel / `.env.local`):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase project + publishable key
- `VITE_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key

**Edge Function secrets (`supabase secrets set`):**
- `RESEND_API_KEY`, `FROM_EMAIL`, `STAFF_EMAIL` (comma-separated allowed)
- `ADMIN_PASSWORD` — admin page password
- `TURNSTILE_SECRET_KEY` — Turnstile secret (CAPTCHA is dormant until set)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase

---

## Repository layout

```
src/
  App.jsx                 booking page (calendar → time → form → confirmation)
  AdminApp.jsx            admin page
  lib/
    supabase.js           browser client (anon key)
    availability/         availability seam (static provider today)
    programs.js           program list (name + type)
    bookings.js           calls create-booking
    admin.js              calls admin-bookings
    settings.js, format.js, dates.js
  components/             Calendar, Sidebar
supabase/
  migrations/             0001–0007 schema (apply in order)
  functions/
    create-booking/       public booking endpoint (hardened)
    admin-bookings/       password-protected admin endpoint
    _shared/              notify.ts (email), ics.ts (calendar)
```

## Local development
```
npm install
npm run dev            # http://localhost:5173 (or next free port)
```
Requires `.env.local` with the Supabase URL + anon key (and Turnstile site key
once issued). Database migrations live in `supabase/migrations/` and are applied
via the Supabase SQL editor or CLI.

---

## Current status

**Done:** full booking flow, availability seeded for 2026–27, branded UI, admin
(list/add/edit/cancel/CSV/kill-switch), and all security controls.

**Remaining to fully launch:**
1. Cloudflare Turnstile keys → activates CAPTCHA.
2. `send.ramaz.org` DNS records (SPF/DKIM) provisioned by IT → switch Resend off
   test mode so confirmations reach outside programs.
