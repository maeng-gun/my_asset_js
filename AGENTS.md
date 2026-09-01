<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Worktree Environment Guidelines
- **Copy .env.local for Worktrees**: Whenever you are asked to start a local development server (e.g., Next.js) inside a branched worktree, ALWAYS check if .env.local exists. If not, you MUST copy the .env.local file from the parent repository before starting the server.
