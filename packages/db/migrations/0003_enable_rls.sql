-- Supabase exposes every table in "public" through its auto-generated REST API (PostgREST).
-- This app talks to Postgres directly as the table owner, which bypasses RLS, so enabling RLS
-- with no policies closes that API off without affecting the app.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crew_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_invitees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rsvps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "availability_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expense_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;
