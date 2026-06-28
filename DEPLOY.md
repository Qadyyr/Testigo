# Deploying Testigo to Vercel (with Neon Postgres)

This guide takes you from zero to a live deployment in ~10 minutes.

## Architecture

- **Frontend + API:** Next.js 16 → deployed to Vercel (free Hobby tier)
- **Database:** PostgreSQL on Neon (free tier: 0.5 GB, serverless)
- **Auth:** NextAuth (JWT, no DB sessions needed)

---

## Step 1 — Create a Neon database (2 min)

1. Go to **https://neon.tech** → Sign up (free, GitHub/Google login)
2. Click **New Project** → name it `testigo` → pick a region close to you → **Create**
3. On the project dashboard, find **Connection Details**
4. Copy the **Pooled connection** string (starts with `postgresql://...`)
   - It looks like: `postgresql://neondb_owner:abc123@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
   - The `?sslmode=require` at the end is important — keep it.

## Step 2 — Set up locally (2 min)

```bash
# If you haven't cloned yet:
git clone https://github.com/Qadyyr/Testigo.git
cd Testigo
cp .env.example .env
```

Edit `.env` and fill in:
```
DATABASE_URL="postgresql://neondb_owner:abc123@ep-xxx...neon.tech/neondb?sslmode=require"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
```

Install deps + create the database schema:
```bash
bun install              # or npm install
bun run db:push          # creates all tables on Neon
bun run seed             # seeds admin + demo tests
```

Verify locally:
```bash
bun run dev
# Open http://localhost:3000
# Admin login: admin@testigo.test / admin1234
# Public test: /?t=pubdemo
```

## Step 3 — Push to GitHub (already done if you cloned from there)

If you made changes locally, push them:
```bash
git add -A
git commit -m "prep for vercel deployment"
git push origin main
```

## Step 4 — Deploy to Vercel (3 min)

1. Go to **https://vercel.com** → Sign up / Log in with GitHub
2. Click **Add New...** → **Project**
3. Import the **Testigo** repository from your GitHub
4. Vercel auto-detects Next.js — **don't change the build settings**
5. Before clicking **Deploy**, expand **Environment Variables** and add these 3:

| Name | Value | Environments |
|---|---|---|
| `DATABASE_URL` | `postgresql://neondb_owner:abc123@ep-xxx...neon.tech/neondb?sslmode=require` | Production, Preview, Development |
| `NEXTAUTH_SECRET` | (the same random string from your `.env`) | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://your-app-name.vercel.app` (you'll know this after first deploy — set it in Step 5) | Production |

> **Note:** `NEXTAUTH_URL` can be left empty for the first deploy. Vercel will auto-detect it. Set it explicitly after you know your URL (Step 5).

6. Click **Deploy** → wait ~2 min for the build to finish

## Step 5 — Post-deploy (1 min)

1. After deploy, you'll get a URL like `https://testigo-xxx.vercel.app`
2. Go to your Vercel project → **Settings** → **Environment Variables**
3. Add/update `NEXTAUTH_URL` = `https://testigo-xxx.vercel.app` (Production)
4. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy)
5. Visit your live URL — Testigo is live! 🎉

## Step 6 — Seed the production database (if not done in Step 2)

If you only seeded locally (Step 2 used your Neon URL, so it's already seeded). If you need to re-seed:

```bash
# Set DATABASE_URL to your Neon production string in .env, then:
bun run db:push    # ensure schema is up to date
bun run seed       # seed admin + demo tests
```

---

## Demo credentials (after seeding)

- **Admin:** `admin@testigo.test` / `admin1234`
- **Public test (no login):** `https://your-app.vercel.app/?t=pubdemo`
- **Whitelist test:** home page → phone `+923001234567` → code `GK2024` or `APT2024`

## Troubleshooting

**"Prisma can't reach database" on Vercel:**
- Check `DATABASE_URL` is set in Vercel env vars with `?sslmode=require`
- Neon's serverless driver works with Prisma's default connector — no extra config needed

**NextAuth error "NEXTAUTH_URL":**
- Set `NEXTAUTH_URL` in Vercel env vars to your production URL
- Redeploy after setting it

**Build fails on Vercel:**
- Check the build logs. The `postinstall: prisma generate` script runs automatically.
- If Prisma client isn't found, ensure `@prisma/client` is in dependencies (it is)

**"Test not found" on production:**
- You need to seed the production database (Step 6) — the demo tests don't exist until you run `bun run seed`

---

## Free tier limits

| Service | Free limit | What happens when exceeded |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth, unlimited deploys | Soft cap, you won't be charged |
| Neon Free | 0.5 GB storage, compute hours | DB pauses when idle (resumes on first request, ~1s delay) |
| NextAuth | N/A (no external service) | — |

Total monthly cost for a small class: **$0**.
