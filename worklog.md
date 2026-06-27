# OmniTest Engine — Shared Worklog

This file is the single source of truth for cross-agent coordination.
Each agent appends a new section (starting with `---`) after finishing its Task ID.
Read previous sections before starting your own task.

## Project Overview
OmniTest Engine — a secure, admin-driven test/survey platform (Next.js 16 SPA on `/`,
SQLite via Prisma, NextAuth admin auth, participant access via `/?t=<shareable-link>`).

## Phase Plan
- Phase 1: Schema + DB + auth + basic admin dashboard & participant layouts (CURRENT)
- Phase 2: 4-step create wizard + Dry-Run import parser (CSV/JSON/MD)
- Phase 3: Scheduling, marking, time limits, whitelist, nanoid links, publish
- Phase 4: Participant OTP (Resend via Inngest job abstraction), test-taking UI, backend timer, anti-cheat, auto-grading
- Phase 5: Analytics dashboard, manual result release + bulk email, CSV export

## Cross-Cutting Conventions
- API response shape: `{ success: boolean, message: string, data?: any }`
- Zod validation on every API input
- All "enum-ish" fields are `String` (SQLite has no Prisma enums); allowed values documented in schema comments and enforced via Zod.
- Single page route only: `src/app/page.tsx` (SPA via search params). API routes are fine.
- Design: shadcn neutral theme + emerald accents. NO indigo/blue. Sticky footer (min-h-screen flex flex-col, footer mt-auto). Mobile-first.
- z-ai-web-dev-sdk only on the backend.


---
Task ID: 1
Agent: orchestrator (main)
Task: Phase 1 — schema + DB + admin auth + API routes + seed + providers/layout wiring; orchestrate frontend subagent; end-to-end verification.

Work Log:
- Reviewed scaffold: Next 16, Prisma 6 (SQLite @ db/custom.db), full shadcn/ui set, next-auth v4, zustand, zod v4, react-hook-form, sonner, recharts, input-otp, next-themes all present.
- Installed bcryptjs + @types/bcryptjs + nanoid.
- Wrote prisma/schema.prisma with all 6 models (Admin, Test, Question, Whitelist, Participant, Attempt, Response). SQLite adaptations: enums→String (allowed values documented + Zod-enforced), Json fields kept as Json (supported on Prisma+SQLite), cuid IDs, indexes on FKs. Designed for trivial Postgres migration later.
- Ran `bun run db:push --accept-data-loss` → schema synced, Prisma client generated (v6.19.2).
- Backend auth: src/lib/auth.ts (NextAuth Credentials + bcrypt + JWT), src/lib/session.ts (getAdminSession helper), src/types/next-auth.d.ts (module augmentation for id+role), src/app/api/auth/[...nextauth]/route.ts (node runtime).
- API routes: src/app/api/admin/stats/route.ts (real Prisma aggregates: counts, avg score, recent tests with attempt counts; admin-guarded) and src/app/api/tests/[link]/route.ts (public test fetch by shareable link with backend-computed scheduledOpen/scheduledClosed).
- prisma/seed.ts: upserts SUPER_ADMIN (admin@omnitest.test / admin1234) + one published PUBLIC sample test (shareableLink "demo123", 15min, IMMEDIATE results) so both dashboard & participant landing are demonstrable. Ran successfully.
- src/components/app/providers.tsx (SessionProvider + ThemeProvider) + updated src/app/layout.tsx (OmniTest metadata, wrapped children in <Providers>). Added NEXTAUTH_SECRET to .env.
- Delegated frontend (Task 2) to full-stack-developer subagent.

Stage Summary:
- DB schema live with seed data. Admin auth (NextAuth Credentials+JWT+bcrypt) working end-to-end. Two API routes returning real data with standardized {success,message,data} shape. Demo admin: admin@omnitest.test / admin1234. Participant demo link: /?t=demo123.
- Decision: dashboard/API guards accept BOTH 'ADMIN' and 'SUPER_ADMIN' roles (seeded admin is SUPER_ADMIN). Documented in code.
- Decision: totalScore stored as percentage 0–100 (aligns with dashboard avg display). Grading logic lands in Phase 4.
- Open items for later phases: Resend/Inngest abstractions (Phase 4), Zod validation on every new endpoint (enforced going forward), partial-credit grading (Phase 4).

---
Task ID: 2
Agent: full-stack-developer (subagent) — files created by subagent; worklog appended by orchestrator because subagent exceeded its max-turns before appending.
Task: Phase 1 frontend — single-route SPA shell, search-param view router, Home, Login, Admin Dashboard, Participant Test views.

Work Log:
- Created src/app/page.tsx (Suspense-wrapped <AppShell/>, the only page route).
- Created src/components/app/use-view-router.ts (search-param router: ?view=home|login|admin, ?t=<token> takes precedence, navigate() helper).
- Created src/components/app/app-shell.tsx (ViewSwitch with framer-motion transitions + Suspense), brand.tsx (emerald ClipboardCheck mark), site-footer.tsx (mt-auto sticky footer).
- Created views/home-view.tsx (hero, Admin Login CTA, test-link input that extracts token from raw value or URL, 3 feature cards), login-view.tsx (react-hook-form+zod, signIn redirect:false, demo-credential hint), admin-dashboard-view.tsx (useSession guard, desktop sidebar + mobile Sheet nav, 4 stat cards, recent-tests table with badges, Create-Test Phase-2 toast), participant-test-view.tsx (fetch by token, loading/404/error states, details card, rules card, schedule-aware Start button).
- Verified available exports: CardAction (card.tsx) and DropdownMenuItem variant="destructive" both exist.

Stage Summary:
- All 9 frontend files created against the agreed API contracts (GET /api/admin/stats, GET /api/tests/{token}). No mock data in dashboard/participant views. Emerald accents, no indigo/blue, sticky footer on every view, mobile-first responsive.
- Orchestrator post-fixes applied after subagent turn-limit: (a) set-state-in-effect lint rule on next-themes hydration gate (added scoped eslint-disable in home + admin views), (b) removed 2 unused eslint-disable directives, (c) admin guard + /api/admin/stats now accept SUPER_ADMIN as well as ADMIN.

---
Task ID: 3
Agent: orchestrator (main)
Task: Refinements to Phase 1 — (1) remove "built to scale" copy; (2) redesign landing page GitHub-style (professional, tech, interactive, simple); (3) rework access model: students access tests ONLY via registered email/phone, enter a per-test code when registered for >1 test; (4) remove core-logic mentions (result mode, anti-cheat) from the participant landing.

Work Log:
- New access model (whitelist-only). Added backend: src/lib/api.ts (ok/fail/normalize helpers); POST /api/tests/lookup (email|phone → published, open, whitelisted tests); POST /api/tests/resolve (email|phone + code → shareableLink, matched only against the caller's whitelisted tests); POST /api/tests/[link]/verify (email|phone → {allowed} for a specific test). All Zod-validated, try/catch, standardized {success,message,data}.
- Updated prisma/seed.ts: 2 WHITELIST tests (demo123/GK2024 "Sample General Knowledge Quiz", demo456/APT2024 "Sample Aptitude Assessment") + shared student (student@omnitest.test / +923001234567) whitelisted on BOTH → demonstrates multi-test → code path. Fixed testId FK bug (use upsert-returned test.id, not the shareable token).
- Redesigned home-view.tsx (GitHub-style): clean top nav (brand + theme toggle + subtle "Admin" link), two-column hero (left: headline "Tests, without the friction." + email/phone entry card; right: decorative terminal accent with staggered line reveal + blinking cursor, desktop only). Removed "built to scale" line and the 3 core-logic feature cards. State machine: entry → looking → multiple(code) / none / error. sessionStorage('omnitest:identity') set on lookup so the landing prefills.
- Rewrote participant-test-view.tsx: removed result-mode badges + "Results" detail row; replaced anti-cheat/auto-save/server-timer rules with benign "Before you start" rules; added "Verify your access" card (email/phone → POST /verify → allowed shows Start Test, denied shows clear message). Reads sessionStorage to prefill identity. Start button still gated on schedule (Open/Not yet open/Closed) and Phase-4 toast.
- Lint clean. Dev server HTTP 200 on / and /?t=demo123. No runtime errors.

Stage Summary:
- Access model is now whitelist-only with code disambiguation for multi-test participants. Demo: enter student@omnitest.test on home → 2 tests found → enter GK2024 (or APT2024) → lands on demo123 (or demo456) → email prefilled → Verify access → Start. Unregistered emails denied on both home lookup ("No tests found") and landing verify ("Not registered").
- Landing is GitHub-style: minimal, emerald accents, monospace terminal accent, no core-logic exposure. Footer still sticky (unchanged from Phase 1).
- Agent-browser verified: home lookup (multi→code→navigate), participant verify (allowed + denied), no-tests-found, admin login → dashboard shows 2 Whitelist tests, mobile (375px) responsive.
- Backward compat note: Test.accessMode still has PUBLIC/CODE/WHITELIST in schema for flexibility, but the app now only creates/uses WHITELIST. The dashboard badge + API still handle all three values gracefully.
