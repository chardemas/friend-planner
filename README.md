# kiki

Low-effort plans with your people. Throw out a hang, a weekly game, or dinner. See who's actually free, get quick RSVPs, and split the bill afterwards.


## What it does

| | |
|---|---|
| **Crews** | Groups you make plans with (volleyball people, dinner club). Join by invite link. |
| **Plans** | Low-key invites: hang / sports / games / food. They can be one-off or **weekly**, with optional spots (capacity) and a subset of invitees. |
| **RSVPs** | "I'm in / Maybe / Can't" for each occurrence. For weekly plans, tick *every week* to set a standing answer, then override single weeks. |
| **Availability** | Paint your usual week (busy/free) on a drag grid and add one-off blocks (trips, deadlines). Plans you say yes to automatically count as busy. |
| **Who's free** | A crew heatmap of the week, plus **Find a time**, which ranks windows by how many people can make it. |
| **Conflict check** | While you create a plan, it shows live who's busy then, and why. |
| **Split costs** | Split evenly or by exact amounts, optionally tied to a plan. Balances are simplified into the fewest "A pays B" transfers, and you can mark payments as paid. |
| **Privacy** | Friends see "Busy", never your block labels. Plans in crews they're not in show as "Has plans". |

## Layout

```
apps/web               Next.js 16 (App Router) + Tailwind v4 + TanStack Query
packages/api           oRPC router + service layer (all business logic lives here)
  src/lib/             Pure logic, unit tested: time zones/DST, recurrence, availability, balances
  src/services/        DB-backed services (crews, plans, availability, expenses, users)
  src/router.ts        Thin transport layer: validate → call service
  scripts/seed.ts      Demo data
packages/db            Drizzle schema, client, SQL migrations
packages/validators    Shared zod input contracts (web + future mobile)
```

The web app talks to `/api/rpc` through a fully typed oRPC client (`apps/web/src/lib/orpc.ts`), so inputs and outputs are checked end to end at compile time.

## Run it locally

You need Node 20+, pnpm (`npm i -g pnpm`), and a Postgres database: either local Postgres or a free Supabase project.

```bash
pnpm install
cp .env.example .env          # then set DATABASE_URL
pnpm db:migrate               # creates the tables
pnpm db:seed                  # optional demo data
pnpm dev                      # http://localhost:3000
```

Create an account with your name, email, and a password (minimum 10 characters), or sign in to an existing account. Without `RESEND_API_KEY`, confirmation and password-reset emails are printed to the terminal running `pnpm dev`, so you can click the links from there. After `pnpm db:seed`, the demo accounts (`alex@lowkey.dev`, `priya@lowkey.dev`, `jordan@lowkey.dev`, `sam@lowkey.dev`, `maya@lowkey.dev`, and `theo@lowkey.dev`) all use the password `lowkey-demo`. The seed script is for local development only and wipes all data.

**Using Supabase:** create a project, open *Project Settings → Database → Connection string*, and paste the URI into `DATABASE_URL` in `.env`. The transaction pooler on port 6543 works fine because the client runs with `prepare: false`.


## Scripts

| Command | |
|---|---|
| `pnpm dev` | Start the web app |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Unit tests, plus an integration test of the whole flow when `DATABASE_URL` is set |
| `pnpm db:generate` | Generate a new migration after editing `packages/db/src/schema.ts` |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / reset demo data (**seed wipes all data**) |

## Accounts and security

- **Sessions** live in the `sessions` table. The browser holds a random token in an httpOnly cookie (mobile can send it as `Authorization: Bearer <token>`), and only its SHA-256 is stored. Sessions last 90 days and slide forward while in use. Signing out deletes the row, and the account page can sign out every other device.
- **Email** confirmation and password reset use single-use, hashed, expiring links (`auth_tokens`), sent through Resend. Resetting a password signs out every device.
- **Rate limits** on sign-in, sign-up, password reset, and resend are counted in Postgres (`rate_limits`), so they hold across serverless instances.
- **Account deletion** (Account page) removes personal data and anonymizes the user row, so shared expense history still balances for everyone else.
- **Row Level Security** is on for every table. The app connects as the table owner and isn't affected, but Supabase's auto-generated REST API can't read anything.

## Deploying

See [DEPLOY.md](DEPLOY.md) for Supabase + Vercel + Resend.

## Known gaps / next steps

- **Mobile app.** Add `apps/mobile` with Expo and reuse `@lowkey/validators` and the `AppRouter` type, so the same oRPC client works there.
- **Notifications.** There are no reminders or "new plan" pings yet. A background job (Pickle uses those) could send a nudge when someone hasn't answered by the day before.
- **Calendar sync.** Plans export to `.ics`. Importing busy times from Google Calendar would fill in availability automatically.
- Editing a plan after creating it isn't built yet (cancel and recreate for now).
