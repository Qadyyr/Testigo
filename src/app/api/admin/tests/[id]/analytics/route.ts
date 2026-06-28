import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tests/{id}/analytics
 * Aggregated analytics for a single test:
 *   - totalAttempts, completedAttempts, avgScore
 *   - scoreDistribution (0-20, 21-40, 41-60, 61-80, 81-100)
 *   - questions: [{ id, text, type, difficulty (% correct), attemptCount }]
 *
 * 401: unauthorized
 * 404: test not found / not owned
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }
    const { id } = await ctx.params

    const test = await db.test.findUnique({
      where: { id },
      select: { id: true, title: true, createdBy: true, resultReleaseMode: true },
    })
    if (!test || test.createdBy !== session.user.id) {
      return fail('Test not found', 404)
    }

    const [attempts, questions, pendingShort] = await Promise.all([
      db.attempt.findMany({
        where: { testId: id, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
        select: { id: true, totalScore: true, status: true, startTime: true, endTime: true },
      }),
      db.question.findMany({
        where: { testId: id },
        orderBy: { order: 'asc' },
        select: { id: true, questionText: true, type: true, order: true, positiveMarks: true },
      }),
      db.response.count({
        where: {
          attempt: { testId: id },
          marksAwarded: null,
          question: { type: 'SHORT' },
        },
      }),
    ])

    const totalAttempts = attempts.length
    const scores = attempts.map((a) => a.totalScore ?? 0)
    const avgScore = totalAttempts > 0 ? Math.round(scores.reduce((s, n) => s + n, 0) / totalAttempts) : 0

    // Score distribution buckets
    const buckets = [0, 0, 0, 0, 0] // 0-20, 21-40, 41-60, 61-80, 81-100
    for (const s of scores) {
      if (s <= 20) buckets[0]++
      else if (s <= 40) buckets[1]++
      else if (s <= 60) buckets[2]++
      else if (s <= 80) buckets[3]++
      else buckets[4]++
    }

    // Per-question difficulty: % of attempts that got it right
    const responses = await db.response.findMany({
      where: {
        attempt: {
          testId: id,
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        },
      },
      select: { questionId: true, isCorrect: true },
    })
    const questionStats = new Map<string, { correct: number; total: number }>()
    for (const r of responses) {
      const s = questionStats.get(r.questionId) ?? { correct: 0, total: 0 }
      s.total++
      if (r.isCorrect) s.correct++
      questionStats.set(r.questionId, s)
    }

    const questionAnalytics = questions.map((q) => {
      const s = questionStats.get(q.id) ?? { correct: 0, total: 0 }
      const difficulty = s.total > 0 ? Math.round((s.correct / s.total) * 100) : null
      return {
        id: q.id,
        text: q.questionText,
        type: q.type,
        order: q.order,
        positiveMarks: q.positiveMarks,
        correctCount: s.correct,
        attemptCount: s.total,
        difficulty, // % correct (null if no attempts)
      }
    })

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        test: { id: test.id, title: test.title, resultReleaseMode: test.resultReleaseMode },
        totalAttempts,
        avgScore,
        scoreDistribution: {
          '0-20': buckets[0],
          '21-40': buckets[1],
          '41-60': buckets[2],
          '61-80': buckets[3],
          '81-100': buckets[4],
        },
        questions: questionAnalytics,
        pendingShortGrading: pendingShort,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/tests/[id]/analytics]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
