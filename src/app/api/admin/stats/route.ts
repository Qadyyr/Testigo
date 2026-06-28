import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/stats
 * Aggregated dashboard metrics for the signed-in admin.
 *
 * Response 200:
 *   { success: true, data: {
 *       totalTests, publishedTests, totalAttempts,
 *       avgScore: number|null,        // average % across graded attempts (0-100)
 *       recentTests: [{ id, title, isPublished, accessMode, createdAt, attempts }]
 *   } }
 * Response 401: { success: false, message: "Unauthorized" }
 */
export async function GET() {
  try {
    const session = await getAdminSession()
    if (
      !session ||
      (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')
    ) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Super Admin sees all tests; regular Admin sees only their own.
    const testFilter = session.user.role === 'SUPER_ADMIN' ? {} : { createdBy: session.user.id }

    const [totalTests, publishedTests, totalAttempts, recentRows, gradedAgg] =
      await Promise.all([
        db.test.count({ where: testFilter }),
        db.test.count({ where: { ...testFilter, isPublished: true } }),
        db.attempt.count({ where: { test: testFilter } }),
        db.test.findMany({
          where: testFilter,
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            isPublished: true,
            accessMode: true,
            createdAt: true,
            _count: { select: { attempts: true } },
          },
        }),
        db.attempt.aggregate({
          _avg: { totalScore: true },
          where: {
            test: testFilter,
            totalScore: { not: null },
            status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
          },
        }),
      ])

    const avgScore = gradedAgg._avg.totalScore ?? null

    const recentTests = recentRows.map((t) => ({
      id: t.id,
      title: t.title,
      isPublished: t.isPublished,
      accessMode: t.accessMode as 'PUBLIC' | 'WHITELIST' | 'INVITE',
      createdAt: t.createdAt.toISOString(),
      attempts: t._count.attempts,
    }))

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        totalTests,
        publishedTests,
        totalAttempts,
        avgScore,
        recentTests,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/stats]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
