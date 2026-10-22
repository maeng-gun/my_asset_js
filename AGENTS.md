<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Worktree Environment Guidelines
- **Copy .env.local for Worktrees**: Whenever you are asked to start a local development server (e.g., Next.js) inside a branched worktree, ALWAYS check if .env.local exists. If not, you MUST copy the .env.local file from the parent repository before starting the server.

# Supabase DDL & Migration Guidelines (Atomic Unit Rule)
Whenever creating new tables or migrating Supabase DB schemas:
- **Mandatory 4-Step Atomic Unit Execution**:
  1. `CREATE TABLE public.xxx ...`
  2. `GRANT ... ON public.xxx TO authenticated, service_role;` (and GRANT USAGE ON SEQUENCES)
  3. `ALTER TABLE public.xxx ENABLE ROW LEVEL SECURITY;`
  4. `CREATE POLICY ... ON public.xxx ...` (Must define `service_role` and `authenticated` policies; Never grant open C.R.U.D to `anon`).
- Refer to `supabase/MIGRATION_GUIDE.md` for full template and checklist.

