import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Neon free tier: 0.5 GB
const NEON_FREE_TIER_BYTES = 512 * 1024 * 1024

/**
 * GET /api/admin/platform-stats
 * Super Admin only — a platform-wide overview that is fundamentally different
 * from a regular admin's personal dashboard.
 *
 * Returns:
 *   - KPIs: total/active/suspended/pending admins, total/published tests,
 *     total/graded attempts, platform avg score, db usage %.
 *   - 7-day trends: tests created, attempts submitted.
 *   - Top admins leaderboard (by attempts) with full per-admin stats.
 *   - Recent activity feed (merged from tests, attempts, admins — top 12).
 *   - Storage gauge.
 */
export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return fail('Super admin access required', 403)
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // --- KPIs (parallel) ---
    const [
      totalAdmins,
      activeAdmins,
      suspendedAdmins,
      pendingAdmins,
      totalTests,
      publishedTests,
      totalAttempts,
      gradedAttempts,
      gradedAgg,
      testsLast7Days,
      attemptsLast7Days,
    ] = await Promise.all([
      db.admin.count(),
      db.admin.count({ where: { status: 'APPROVED' } }),
      db.admin.count({ where: { status: 'SUSPENDED' } }),
      db.admin.count({ where: { status: 'PENDING' } }),
      db.test.count(),
      db.test.count({ where: { isPublished: true } }),
      db.attempt.count(),
      db.attempt.count({
        where: {
          totalScore: { not: null },
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        },
      }),
      db.attempt.aggregate({
        _avg: { totalScore: true },
        where: {
          totalScore: { not: null },
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        },
      }),
      db.test.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      db.attempt.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ])

    // --- Storage usage (real-time from Postgres) ---
    let dbUsagePercentage = 0
    let dbUsedMB = 0
    let dbLimitMB = 512
    try {
      const sizeResult = await db.$queryRaw<[{ db_size: bigint }]>`
        SELECT pg_database_size(current_database()) as db_size
      `
      const usedBytes = Number(sizeResult[0]?.db_size ?? 0)
      dbUsagePercentage =
        Math.round((usedBytes / NEON_FREE_TIER_BYTES) * 10000) / 100
      dbUsedMB = Math.round((usedBytes / (1024 * 1024)) * 100) / 100
      dbLimitMB = Math.round((NEON_FREE_TIER_BYTES / (1024 * 1024)) * 100) / 100
    } catch {
      // Non-fatal: storage gauge just shows 0 if the query fails.
    }

    // --- Top admins leaderboard (by attempts, top 5) ---
    const admins = await db.admin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { tests: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const adminStats = await Promise.all(
      admins.map(async (a) => {
        const [questions, attempts, participants, lastTest, lastAttempt] =
          await Promise.all([
            db.question.count({ where: { test: { createdBy: a.id } } }),
            db.attempt.count({ where: { test: { createdBy: a.id } } }),
            db.participant.count({ where: { test: { createdBy: a.id } } }),
            db.test.findFirst({
              where: { createdBy: a.id },
              orderBy: { createdAt: 'desc' },
              select: { title: true, createdAt: true },
            }),
            db.attempt.findFirst({
              where: { test: { createdBy: a.id } },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
          ])
        return {
          adminId: a.id,
          name: a.name ?? a.email,
          email: a.email,
          role: a.role,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          testCount: a._count.tests,
          questionCount: questions,
          attemptCount: attempts,
          participantCount: participants,
          lastTestTitle: lastTest?.title ?? null,
          lastTestDate: lastTest?.createdAt.toISOString() ?? null,
          lastAttemptDate: lastAttempt?.createdAt.toISOString() ?? null,
        }
      })
    )

    const topAdmins = [...adminStats]
      .sort((a, b) => b.attemptCount - a.attemptCount)
      .slice(0, 5)

    // --- Recent activity feed (merged: tests + attempts + admins, top 12) ---
    const [recentTests, recentAttempts, recentAdmins] = await Promise.all([
      db.test.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          title: true,
          createdAt: true,
          admin: { select: { name: true, email: true } },
        },
      }),
      db.attempt.findMany({
        where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          createdAt: true,
          totalScore: true,
          test: { select: { title: true } },
          participant: { select: { name: true } },
        },
      }),
      db.admin.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, name: true, email: true, createdAt: true },
      }),
    ])

    type Activity = {
      type: 'test_created' | 'attempt_submitted' | 'admin_joined'
      timestamp: string
      actor: string
      detail: string
    }
    const activity: Activity[] = []
    for (const t of recentTests) {
      activity.push({
        type: 'test_created',
        timestamp: t.createdAt.toISOString(),
        actor: t.admin.name ?? t.admin.email,
        detail: t.title,
      })
    }
    for (const a of recentAttempts) {
      activity.push({
        type: 'attempt_submitted',
        timestamp: a.createdAt.toISOString(),
        actor: a.participant.name ?? 'A student',
        detail: `${a.test.title}${
          a.totalScore !== null ? ` · ${Math.round(a.totalScore)}%` : ''
        }`,
      })
    }
    for (const a of recentAdmins) {
      activity.push({
        type: 'admin_joined',
        timestamp: a.createdAt.toISOString(),
        actor: a.name ?? a.email,
        detail: 'joined the platform',
      })
    }
    activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const recentActivity = activity.slice(0, 12)

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        kpis: {
          totalAdmins,
          activeAdmins,
          suspendedAdmins,
          pendingAdmins,
          totalTests,
          publishedTests,
          totalAttempts,
          gradedAttempts,
          avgScore: gradedAgg._avg.totalScore ?? null,
          testsLast7Days,
          attemptsLast7Days,
        },
        storage: {
          percentage: dbUsagePercentage,
          usedMB: dbUsedMB,
          limitMB: dbLimitMB,
        },
        topAdmins,
        recentActivity,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/platform-stats]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
