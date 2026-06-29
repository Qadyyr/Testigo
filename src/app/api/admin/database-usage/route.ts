import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Neon free tier: 0.5 GB
const NEON_FREE_TIER_BYTES = 512 * 1024 * 1024

/**
 * GET /api/admin/database-usage
 * Super Admin only — real-time database storage usage + per-admin breakdown.
 *
 * 200: {
 *   success,
 *   data: {
 *     usedBytes, limitBytes, percentage, usedMB, limitMB,
 *     counts: { admins, tests, questions, attempts, responses, participants },
 *     perAdmin: [{ adminId, name, email, testCount, attemptCount, questionCount, participantCount }]
 *   }
 * }
 */
export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return fail('Super admin access required', 403)
    }

    // Real-time DB size from PostgreSQL.
    const sizeResult = await db.$queryRaw<[{ db_size: bigint }]>`
      SELECT pg_database_size(current_database()) as db_size
    `
    const usedBytes = Number(sizeResult[0]?.db_size ?? 0)
    const limitBytes = NEON_FREE_TIER_BYTES
    const percentage = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0

    // Global counts.
    const [adminCount, testCount, questionCount, attemptCount, responseCount, participantCount] =
      await Promise.all([
        db.admin.count(),
        db.test.count(),
        db.question.count(),
        db.attempt.count(),
        db.response.count(),
        db.participant.count(),
      ])

    // Per-admin breakdown: group tests by createdBy, count their children.
    const admins = await db.admin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        _count: { select: { tests: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // For each admin, count their tests' attempts + questions.
    const perAdmin = await Promise.all(
      admins.map(async (a) => {
        const [questions, attempts, participants] = await Promise.all([
          db.question.count({ where: { test: { createdBy: a.id } } }),
          db.attempt.count({ where: { test: { createdBy: a.id } } }),
          db.participant.count({ where: { test: { createdBy: a.id } } }),
        ])
        return {
          adminId: a.id,
          name: a.name ?? a.email,
          email: a.email,
          role: a.role,
          status: a.status,
          testCount: a._count.tests,
          questionCount: questions,
          attemptCount: attempts,
          participantCount: participants,
        }
      })
    )

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        usedBytes,
        limitBytes,
        percentage: Math.round(percentage * 100) / 100,
        usedMB: Math.round((usedBytes / (1024 * 1024)) * 100) / 100,
        limitMB: Math.round((limitBytes / (1024 * 1024)) * 100) / 100,
        counts: {
          admins: adminCount,
          tests: testCount,
          questions: questionCount,
          attempts: attemptCount,
          responses: responseCount,
          participants: participantCount,
        },
        perAdmin,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/database-usage]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
