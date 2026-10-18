# Deploying kiki

Production runs on **Vercel** (web + API), **Supabase** (Postgres), and **Resend** (email). All three have free tiers that comfortably cover a friend group.

Migrations run automatically during every **production** Vercel build (see `apps/web/vercel.json`). Preview deployments skip them, so a branch can never change the production schema.

## 1. Database (Supabase)

1. Create a **new** Supabase project for production. Don't reuse your dev project, because `pnpm db:seed` wipes all data.
2. Pick a region close to your Vercel region (e.g. both in US East).
3. Copy the connection string: **Connect → Transaction pooler** (host `aws-…pooler.supabase.com`, port **6543**). Substitute your database password.
   - Use the pooler, not the direct `db.<ref>.supabase.co` host. The direct host is IPv6-only, and Vercel can't reach it.
4. Backups: the free plan keeps daily backups for 7 days. If you upgrade to Pro, turn on Point-in-Time Recovery under **Database → Backups**.

You don't need to create tables. The first production deploy runs the migrations, which also turn on Row Level Security for every table.

## 2. Email (Resend)

1. Sign up at resend.com and create an API key.
2. To email anyone besides yourself you need a domain you own. Add it under **Domains** and create the DNS records Resend shows you (SPF/DKIM). Until then, Resend's test sender only delivers to your own address.
3. Choose a from-address on that domain, e.g. `kiki <hello@yourdomain.com>`.

## 3. Web app (Vercel)

1. Push the repo to GitHub, then go to vercel.com → **Add New → Project** and import it.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm, and installs the whole workspace.
3. Add these under **Environment Variables**, scoped to **Production**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler URL from step 1 |
   | `RESEND_API_KEY` | from step 2 |
   | `EMAIL_FROM` | e.g. `kiki <hello@yourdomain.com>` |
   | `APP_URL` | `https://yourdomain.com` (optional; defaults to the Vercel production domain) |
   | `CONTACT_EMAIL` | your own email: shown on `/privacy`, and where replies to kiki's emails go |

   For **Preview** deployments, either point `DATABASE_URL` at a separate Supabase project or leave it unset. Never point previews at the production database: they skip migrations, but they still read and write data.
4. Deploy. In the build log, look for `✓ migrations applied` before `next build`.
5. Optional: add a custom domain under **Settings → Domains**, then set `APP_URL` to it and redeploy.

## 4. Check it works

1. Open the site, create an account, and confirm you receive the confirmation email.
2. Sign out, use **Forgot?**, and confirm the reset link works.
3. Create a crew, open the invite link in a private window, and join with a second account.

## Ongoing

- **Schema changes:** edit `packages/db/src/schema.ts`, run `pnpm db:generate`, and commit the new migration. The next production deploy applies it. Keep migrations backwards-compatible (add columns before you use them, and remove old ones in a later deploy). For a few seconds during a deploy, the previous version keeps serving traffic against the new schema.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) typechecks and runs the unit tests on every push and PR. Integration tests need a database, so run `pnpm test` locally with `DATABASE_URL` set.
- **Errors:** Vercel → your project → **Logs** shows server errors. For alerts, add Sentry (`npx @sentry/wizard@latest -i nextjs`).
