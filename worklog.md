# Testigo — Shared Worklog

This file is the single source of truth for cross-agent coordination.
Each agent appends a new section (starting with `---`) after finishing its Task ID.
Read previous sections before starting your own task.

## Project Overview
Testigo — a secure, admin-driven test/survey platform (Next.js 16 SPA on `/`,
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

---
Task ID: 4
Agent: orchestrator (main)
Task: Switch participant access from "email or phone" single field to PHONE-ONLY across home, participant landing, and all backend APIs; re-seed phone-only whitelists.

Work Log:
- Backend: rewrote /api/tests/lookup, /api/tests/resolve, /api/tests/[link]/verify — Zod schema now requires `phone` (min 7), removed email branch; queries use `whitelists: { some: { phone: phoneNorm } }`; removed unused normalizeEmail import.
- Seed: student whitelist entries now phone-only (upsert by testId_phone, email omitted); added `deleteMany({})` before re-seed for idempotency; confirmed SQL INSERT has no email column.
- Frontend home-view: removed splitIdentity helper; state identity→phone; input type=tel autoComplete=tel placeholder "+92 300 1234567"; payload {phone}; sessionStorage key 'omnitest:phone'; copy updated ("phone number" everywhere); terminal accent line "phone registered ✓".
- Frontend participant-test-view: removed splitIdentity; TestDetails props identity→phone/setPhone; input type=tel; sessionStorage read 'omnitest:phone'; denied message "This phone number isn't on the test's access list"; copy updated.

Stage Summary:
- Participant access is now phone-only end-to-end. Demo phone: +923001234567 (whitelisted on demo123/GK2024 + demo456/APT2024). Agent-browser verified: home phone lookup → 2 tests → code GK2024 → landing with phone prefilled → Verify access → "Access verified" + Start Test; unregistered phone → "Not registered". Lint clean, no runtime errors.
- Schema unchanged (email column remains on Whitelist for future use, nullable). normalizeEmail kept exported in lib/api.ts for later. Email is simply unused in the participant flow for now.

---
Task ID: 5
Agent: orchestrator (main)
Task: Rebrand "OmniTest Engine" → "Testigo" across the entire codebase.

Work Log:
- User-facing wordmark (brand.tsx): "OmniTest Engine" → "Testigo" (single word, emerald icon square kept). Updated comment.
- Metadata (layout.tsx): title "Testigo — Secure Test Platform", OG/Twitter/siteName/authors/keywords all → Testigo.
- Footer (site-footer.tsx): "© {year} Testigo".
- Home view: terminal accent commands → testigo identify / testigo tests / testigo start --code GK2024; session label "testigo — session"; sessionStorage key 'testigo:phone'; aria-label "Testigo — home".
- Login view: aria-label "Testigo — home"; demo credential hint email → admin@testigo.test.
- Participant view: sessionStorage key 'testigo:phone'; aria-label "Testigo — home".
- auth.ts + schema.prisma + seed.ts comments → Testigo. Seed admin email → admin@testigo.test, admin name → "Testigo Admin". Re-ran seed (new admin row created). Fixed stale "email/phone" seed comment → "phone number".
- Updated worklog header overview line to "Testigo".

Stage Summary:
- Fully rebranded to Testigo. Zero "omnitest" references remain in source (.ts/.tsx/.prisma). Browser tab title "Testigo — Secure Test Platform". Login verified with admin@testigo.test / admin1234 → dashboard shows Testigo brand + 2 sample tests. Terminal accent (aria-hidden) shows testigo CLI commands. Lint clean, no runtime errors.
- New admin login: admin@testigo.test / admin1234 (old admin@omnitest.test row still exists in DB but unused). Demo student phone unchanged: +923001234567.

---
Task ID: 6
Agent: full-stack-developer
Task: Phase 2 frontend — 4-step "Create Test" wizard view (Details & Import → Settings → Access Control → Review & Publish) with dry-run import, commit, and publish flow.

Work Log:
- Read worklog + question-parser.ts to lock the ParsedQuestion/ParseError/DryRunResult/ParseFormat types and SAMPLE_CSV/JSON/MD constants; verified shadcn ui exports (Card+CardAction, RadioGroup, Switch, Separator, Alert, Table, Tooltip, Skeleton, Badge) and the Brand/SiteFooter/use-view-router contracts.
- Created src/components/app/views/create-test-view.tsx as a single 'use client' component (CreateTestView) with internal presentational helpers (StepIndicator, Step1Details, DryRunResults, Step2Settings, Step3Access, Step4Review, SuccessScreen, CreateTestSkeleton) — only CreateTestView is exported.
- Auth guard mirrors the dashboard: useSession, accept ADMIN or SUPER_ADMIN, redirect to ?view=login when unauthenticated/non-admin, render CreateTestSkeleton while status==='loading'.
- Sticky header: Brand (clickable → navigate('admin')), "Step X of 4" counter, and a horizontally-scrollable step indicator (completed=emerald check, current=emerald filled, future=muted; completed steps clickable to jump back). View root is `flex flex-1 flex-col` with SiteFooter (mt-auto) for the sticky footer.
- Step 1: title (required) + description textarea; format selector (Markdown/CSV/JSON) using aria-pressed toggle buttons; "Load sample" injects the matching SAMPLE_*; monospace content textarea; emerald "Run dry run" → POST /api/admin/tests/dry-run; results show "✓ N valid / ✗ M errors" badges, a max-h-72 scrollable errors table (Row|Excerpt|Error, destructive text, custom scrollbar), a green Alert + "Import N valid questions" button, and a post-import success Alert with "Re-run". Next is disabled (tooltip "Import at least one question first") until imported.length>0; Cancel → navigate('admin').
- Step 2: schedule (two datetime-local + timezone "Asia/Karachi" default), optional time-limit, marking (positiveMarks=1 / negativeMarks=0), maxAttempts=1, results RadioGroup (Immediate/Manual) as selectable cards. All inputs keep string state; conversion happens on submit.
- Step 3: RadioGroup of 4 access modes as card rows (Globe/Lock/Users/Ticket icons); selecting CODE reveals accessCode input, WHITELIST reveals a phone-number textarea with a live count badge, INVITE reveals an inviteCount number input + note. Next always enabled (validation deferred to create).
- Step 4: review summary (title, description, question count badge, schedule, time limit, marking, max attempts, result mode, access mode + mode-specific detail), "Publish immediately" Switch, emerald Create button. handleCreate builds the body exactly per the contract (ISO datetimes via new Date(str).toISOString(), Number() conversions with safe fallbacks, whitelist split/trim/filter, inviteCount only for INVITE) and POSTs /api/admin/tests; on 400 toasts the server message, on 401 redirects to login. On success swaps to a SuccessScreen (CheckCircle2, copyable `/?t=<shareableLink>` field, scrollable max-h-64 list of `/?invite=<token>` links each with its own copy button, "Go to dashboard" + "Create another" which resets all state).
- Polished: emerald accents only (no indigo/blue), mobile-first (375px tested mentally — step indicator scrolls, grids collapse), clipboard via navigator.clipboard with sonner toasts, window.location.origin tracked in state to avoid hydration mismatch on the success links.

Stage Summary:
- One file delivered: src/components/app/views/create-test-view.tsx (~1684 lines, single export CreateTestView). Did NOT touch app-shell.tsx/router/dashboard — orchestrator to wire `?view=create` → <CreateTestView/> in AppShell's ViewSwitch.
- Assumptions: (1) ParseError type intentionally NOT imported (unused → would trip no-unused-vars); DryRunResult/ParseFormat/ParsedQuestion imported and used. (2) "Cancel" rendered as a ghost Button (functionally a link) rather than an <a>. (3) Create button is full-width on mobile, auto-width right-aligned on sm+ for natural Back/Next pairing. (4) Editing the import textarea clears the stale dry-run result but preserves a committed `imported` set until the next dry run re-commits (safe + avoids losing work on stray keystrokes). (5) Access-mode conditional inputs live inside each option's label card (clicking a nested form control does not toggle the radio per HTML spec). (6) Did not run lint/dev per instructions; API contracts coded verbatim (dry-run + create).
- The orchestrator still needs to: add `case 'create': content = <CreateTestView />` to app-shell.tsx ViewSwitch, and implement the two backend routes (POST /api/admin/tests/dry-run, POST /api/admin/tests) to match the contracts above.

---
Task ID: 7
Agent: orchestrator (main)
Task: Phase 2 — Create Test wizard + Dry-Run import engine (CSV/JSON/MD) with error reporting; wire into dashboard; end-to-end verification.

Work Log:
- Schema: added Invitation model (single-use tokens for INVITE mode) + extended accessMode to PUBLIC|CODE|WHITELIST|INVITE. db:push synced.
- Backend parser: src/lib/question-parser.ts — dryRunParse(format, content) supporting JSON (array of objects), CSV (RFC-4180 quoted fields, semicolon-separated options/answers), Markdown (### headers, - [ ]/- [x] MCQ options, type:/answer:/marks:/neg: directives). Validates every row: non-empty questionText, MCQ needs ≥2 options + valid correct indices, TEXT needs ≥1 answer, marks ≥0. Returns {valid, errors:[{row,excerpt,error}], total}. Includes SAMPLE_CSV/JSON/MD with a deliberate broken row.
- Backend routes: POST /api/admin/tests/dry-run (admin-guarded, Zod, returns DryRunResult), POST /api/admin/tests (admin-guarded, Zod, creates test+questions+whitelist/invitations, nanoid(12) shareable link, nanoid(16) invite tokens, mode-specific validation, returns {id, shareableLink, questionCount, isPublished, inviteLinks?}).
- Frontend: delegated 4-step wizard to subagent (Task 6) → create-test-view.tsx. Wired: router 'create' view, app-shell switch, dashboard both Create Test buttons now navigate('create').
- Fixed: EmptyTestsState needed useViewRouter() hook for navigate.

Stage Summary:
- Full create-test flow works end-to-end. Agent-browser verified: login → dashboard → Create Test → wizard step 1 (load MD sample → dry run: 3 valid / 1 error "Missing correct_answers array" in error table → import 3) → step 2 settings → step 3 access control (4 modes) → step 4 review+publish → "Publish test" → success screen with copyable link /?t=pqMG_dYE4KkX → dashboard shows new "Phase 2 Demo Quiz" (3 tests total) → link opens participant landing. Lint clean, no runtime errors.
- The 4 hybrid access modes are wired in the wizard (Public/Password/Whitelist/Invitation). Participant-side handling of password/invite flows lands in Phase 4 (the landing currently shows phone-verify for all modes; will be made mode-aware). Whitelist + Public already work end-to-end.
- Questions saved to DB with order, type, options (JSON), correctAnswers (JSON), per-question marks. Ready for Phase 4 grading.

---
Task ID: 9
Agent: orchestrator (main)
Task: Phase 4 — participant test-taking experience end-to-end: Option B access model (primary gate + optional code overlay), generic identifier column, mode-aware gate, session JWT, test-taking UI (split screen, timer, palette, auto-save, anti-cheat), auto-grading, result screen.

Work Log:
- Schema rework: accessMode now PUBLIC|WHITELIST|INVITE (removed CODE); added requireCode Boolean + accessCode (overlay); removed isPublic (redundant); renamed Whitelist.phone→identifier + identifierType (generic, future-proof for email/student-ID); Participant.phone/email→identifier+identifierType; resultReleaseMode gains NEVER option; added Invitation model (single-use tokens). db:push --force-reset.
- Backend: src/lib/session-token.ts (JWT sign/verify, Bearer extraction); src/lib/api.ts updated (normalizeIdentifier). New routes: POST /api/tests/[link]/start (sequential gate: valid+published → schedule window → whitelist → code overlay → already-attempted → create attempt + issue JWT; handles resume); GET /api/tests/[link]/load (Bearer-gated, strips correctAnswers, parses Json arrays); PATCH /api/attempts/[id]/save (Bearer-gated, upsert Response); POST /api/attempts/[id]/submit (flush answers, auto-grade MCQ exact/partial, TEXT→pending, compute 0-100 score, mark SUBMITTED/AUTO_SUBMITTED). Deleted old /verify route (superseded by /start).
- Frontend: rewrote participant-test-view.tsx (4 phases: landing→gating→taking→result). Mode-aware gate (phone for WHITELIST, invite token for INVITE, optional code). Taking phase: split screen (question left, palette right on desktop), backend-driven timer (mm:ss, color by urgency), question palette (answered/flagged/current states), MCQ checkboxes + TEXT textarea, auto-save on change + every 10s, anti-cheat visibilitychange (warn twice, auto-submit on 3rd), submit confirm dialog. Result screen: score %, correct count, per-question breakdown (if showResults), manual-pending / never-shown states. Zustand store for answers/current/flagged. Session token in ref + sessionStorage (refresh recovery).
- Updated home view (phone→identifier field), create-test wizard (removed CODE mode, added requireCode toggle + accessCode overlay card, updated review step), dashboard badges (PUBLIC/WHITELIST/INVITE), lookup/resolve APIs (identifier). Seed: 3 tests (WHITELIST+code x2, PUBLIC no-code with 2 MCQs).
- Fixed 3 bugs found during verification: (1) Prisma client not regenerated after schema reset → restart dev server; (2) isPublic field removed from schema but still referenced in routes → removed; (3) SQLite Json double-encoding (seed used JSON.stringify, Prisma also serializes → double-encoded string) → added parseJsonArray helper in load + submit routes, fixed seed to pass raw arrays.

Stage Summary:
- Full test-taking flow verified end-to-end via Agent Browser: pubdemo (PUBLIC) → Start Test → gate → Q1 "What is 2+2?" (click 4) → auto-save "1 answered" → Next → Q2 "Capital of France?" (click Paris) → Submit → confirm → RESULT "100% — 2 of 2 correct" with per-question marks. Auto-grading, backend timer, auto-save, palette all working. Lint clean.
- Demo: pubdemo (public, no code, 2 MCQs) for the full flow; demo123 (whitelist +923001234567 + code GK2024); demo456 (whitelist + code APT2024). Admin: admin@testigo.test / admin1234.
- Pending for Phase 5: manual TEXT grading UI, analytics dashboard, CSV export, manual result release + bulk email. Randomization (question/option order) not yet implemented. INVITE mode creates tokens but participant-side invite consumption via /?invite=<token> is wired but untested in browser.

---
Task ID: 10
Agent: orchestrator (main)
Task: Fix result review — participants couldn't see questions, their answers, or correct answers after submitting.

Work Log:
- Root cause: submit API only returned {questionId, userAnswer, isCorrect, marksAwarded} — no question text, options, or correct answers. Frontend had nothing to render a real review.
- Fix API (submit route): gradedAnswers now includes questionText, type, options[], correctAnswers[], positiveMarks, negativeMarks. MCQ returns options + correct indices; TEXT returns acceptable answers.
- Fix frontend (Result component): rewrote the review section. For MCQ: shows each question with full text, all options listed, the user's selection highlighted (red if wrong), the correct option highlighted (emerald + check), and marks badge. For TEXT: shows "Your answer" box + "Acceptable answers" box. Updated GradedAnswer interface to match.
- Verified via Agent Browser: pubdemo → start → answer Q1 (4) → Q2 (Paris) → submit → result now shows "Review — questions & answers" with both questions fully expanded: "What is 2 + 2?" (options 3/4✓correct/5/22, +1/1) and "Capital of France?" (London/Berlin/Paris✓correct/Madrid, +1/1).

Stage Summary:
- Review now works. After submitting, participants see every question with its text, all options, which one they picked, which was correct, and their marks. Lint clean.

---
Task ID: 11
Agent: orchestrator (main)
Task: Deploy Testigo to Vercel (Neon Postgres) + fix build errors + verify live deployment.

Work Log:
- Switched schema to postgresql, removed standalone output, added postinstall:prisma generate, wrote DEPLOY.md.
- Pushed schema + seed to Neon (ep-icy-union-atrgvemq.c-9.us-east-1.aws.neon.tech) — 1 admin, 3 tests, 2 questions, 2 whitelists.
- Vercel build failed: stale normalizePhone import + whitelist.phone column (renamed in Phase 4), Prisma JsonNull for null JSON fields, missing useViewRouter in DashboardContent, type cast for review rendering. Ran tsc --noEmit, fixed all 6 src/ errors, pushed.
- Live deployment verified end-to-end at https://testigo-beryl.vercel.app: home renders, admin login (admin@testigo.test/admin1234) → dashboard shows 3 tests, pubdemo public test → start → gate → take (timer+palette+autosave) → answer Q1(4)+Q2(Paris) → submit → RESULT "100% — 2 of 2 correct" with full review (questions, options, correct answers highlighted).

Stage Summary:
- PRODUCTION LIVE at https://testigo-beryl.vercel.app. Stack: Next.js 16 (Vercel) + Postgres (Neon) + NextAuth. $0/month. Full test-taking flow works on production: create (admin) → take (participant) → auto-grade → review. DB auto-pauses when idle (~1s cold start). All env vars set on Vercel.

---
Task ID: 12
Agent: orchestrator (main)
Task: Simplify import format (question/options/correct/explanation/type only) + test-level marks + new question types (MCQ/TRUE_FALSE/SHORT) + explanations in review.

Work Log:
- Schema: added `explanation String?` to Question model. Pushed to Neon.
- Parser rewrite: simplified format — only questionText, type, options, correctAnswers, explanation. Removed positiveMarks/negativeMarks from parsed output. New types: MCQ, TRUE_FALSE (auto-generates [True,False] if no options), SHORT (replaces TEXT). Updated SAMPLE_CSV/JSON/MD with explanations + all 3 types + a deliberate broken row.
- Create API: questionSchema now accepts explanation, type enum MCQ|TRUE_FALSE|SHORT. Questions created with test-level positiveMarks/negativeMarks (no per-question marks in import).
- Submit/grading: MCQ || TRUE_FALSE graded as MCQ; SHORT graded as old TEXT. gradedAnswers now includes explanation. Returns explanation in review data.
- Frontend participant view: LoadQuestion type updated; taking UI renders TRUE_FALSE as MCQ; review shows explanation per question (muted box). GradedAnswer interface updated.
- Wizard: placeholder text updated to new format; Step 2 marks label "Marks awarded for every question in this test" (test-level, not per-question).
- Seed: demo questions now have explanations ("2 + 2 = 4." / "Paris has been the capital of France since 987 AD.").
- Re-seeded Neon, pushed to GitHub, Vercel auto-deployed.

Stage Summary:
- Live at https://testigo-beryl.vercel.app verified: pubdemo → start → answer → submit → result "100% — 2 of 2 correct" with explanations shown in review for both questions. Lint clean, tsc clean. Import format is now simple (5 fields only); marks are test-level; 3 question types supported.

---
Task ID: 13
Agent: orchestrator (main)
Task: Simplify home page — students access tests via unique code or direct link (no phone lookup).

Work Log:
- New POST /api/tests/resolve-code: accepts { code }, finds published test by accessCode, returns shareableLink. Removed old /api/tests/lookup + /api/tests/resolve (phone-based).
- Home view rewritten: single input "Enter test code or paste link". If URL with ?t=xxx → navigate direct. If code → POST resolve-code → navigate. Code stored in sessionStorage for gate to pre-fill. Terminal accent updated to code-based flow.
- accessCode is now REQUIRED on every test (it's the join code students use). requireCode toggle renamed to "Require code at the gate" (optional extra security). Create API stores accessCode always; wizard Step 3 shows code field always + separate toggle.
- Participant gate: pre-fills code from sessionStorage('testigo:code') if entered on home page. Removed old 'testigo:identifier' references.
- Seed: pubdemo now has code PUB2024. All 3 tests accessible via code (GK2024/APT2024/PUB2024) or direct link.
- Re-seeded Neon, pushed to GitHub, Vercel auto-deployed.

Stage Summary:
- Live verified: home → enter "PUB2024" → opens pubdemo → start → answer → submit → "100% — 2 of 2 correct" with explanations. The phone-lookup flow is gone; students just enter a code or use a link. Lint + tsc clean.

---
Task ID: 14
Agent: orchestrator (main)
Task: Add question preview step to bulk import (admin verifies questions before proceeding) + ensure every import format shows question type.

Work Log:
- New QuestionPreview component in create-test-view.tsx: renders every parsed question read-only with: number, type badge (MCQ=emerald, TRUE_FALSE=amber, SHORT=sky), question text, all options with correct answer highlighted emerald + check icon, acceptable answers box for SHORT, explanation in muted box. Scrollable (max-h-28rem) for large sets.
- Preview appears at TWO points: (1) "ready to import" — before clicking Import, so admin can verify; (2) "imported" — after import, before proceeding to Step 2. Both show the full preview.
- Type badges color-coded per type (Multiple Choice / True-False / Short Answer).
- All 3 sample formats (CSV/JSON/MD) already include `type` per question (MCQ/TRUE_FALSE/SHORT) — no change needed there.
- Pushed to GitHub, Vercel auto-deployed.

Stage Summary:
- Live verified on Vercel: admin → Create Test → Step 1 → Load sample → Run dry run → shows "4 valid, 1 error" + PREVIEW card with all 4 questions rendered (type badges, correct answers highlighted, explanations). Admin can verify everything before importing. Lint + tsc clean.

---
Task ID: 15
Agent: orchestrator (main)
Task: Fix two bugs: (1) test code doesn't work properly on landing (redundant gate for public tests), (2) test-taking UI broken on mobile.

Work Log:
- Bug 1 (gate): PUBLIC tests with requireCode=false no longer show the pointless "Verify your access / Start test" gate. Gating component now auto-starts (useEffect calls handleStart) and shows a spinner "Starting your test…" while the attempt is created. WHITELIST/INVITE/requireCode tests still show the gate form as before.
- Bug 2 (mobile): palette was stacking below the question on mobile, pushing navigation off-screen. Fixed: desktop keeps the sidebar (hidden lg:block); mobile gets a sticky bottom bar with "Questions X/N" toggle (opens a bottom Sheet with the full palette) + a "Submit" button. Both share a new PaletteContent component. Tested at 375px: question + options render, Previous/Next work, palette Sheet opens, submit works, result renders.
- Live verified on Vercel: pubdemo → Start Test → goes straight to taking (no gate) → mobile layout works end-to-end → submit → result with review.

Stage Summary:
- Both bugs fixed. Public tests now skip the redundant gate. Mobile test-taking UI has a sticky bottom bar (Questions toggle + Submit) instead of stacking the palette. Lint + tsc clean.

---
Task ID: 16
Agent: orchestrator (main)
Task: Fix mobile responsiveness for question previews (wizard Step-1 QuestionPreview + participant result Review).

Work Log:
- Diagnosed: both preview components used pl-10 (2.5rem left indent) which ate horizontal space on 375px screens; flex items-center + ml-auto labels overflowed; explanation label+text were inline and crammed.
- Fixed both components (create-test-view.tsx QuestionPreview + participant-test-view.tsx Result review):
  - pl-10 → sm:pl-10 (full-width on mobile, indented on desktop only)
  - p-4 → p-3 sm:p-4, px-3 → px-2.5 (tighter mobile padding)
  - flex items-center → flex items-start on mobile (icons align to text top, prevents vertical centering issues with wrapping text)
  - Added min-w-0 flex-1 on option text + shrink-0 on labels (prevents overflow)
  - flex-wrap on badges row (wraps on narrow screens instead of overflowing)
  - explanation: inline label+text → stacked block label + break-words text
  - break-words added to all text content (long answers/URLs don't overflow)
- Live verified on Vercel at 375px (iPhone SE width):
  - Result review: "100% — 2 of 2 correct" + both questions with options, correct highlights, explanations — overflowX=false, scrollH=1198
  - Wizard preview: all 4 questions (MCQ/TRUE_FALSE/SHORT) with type badges, options, correct answers, explanations — overflowX=false, scrollH=2466

Stage Summary:
- Both question previews are now mobile-responsive. No horizontal overflow at 375px. Content stacks cleanly: question number + type badge + text on top, options full-width below, explanation as a stacked labeled box. Lint + tsc clean.
