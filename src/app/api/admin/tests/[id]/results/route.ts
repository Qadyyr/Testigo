import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tests/{id}/results
 * Returns all attempts for a test, with per-question responses.
 * Used for CSV export + the results table.
 *
 * Query: ?format=csv → returns CSV text. Default → JSON.
 *
 * 401: unauthorized
 * 404: test not found / not owned
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }
    const { id } = await ctx.params
    const url = new URL(req.url)
    const format = url.searchParams.get('format')

    const test = await db.test.findUnique({
      where: { id },
      select: { id: true, title: true, createdBy: true },
    })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== "SUPER_ADMIN")) {
      return fail('Test not found', 404)
    }

    const [questions, attempts] = await Promise.all([
      db.question.findMany({
        where: { testId: id },
        orderBy: { order: 'asc' },
        select: { id: true, questionText: true, order: true },
      }),
      db.attempt.findMany({
        where: { testId: id, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
        include: {
          participant: { select: { identifier: true, name: true } },
          responses: { select: { questionId: true, isCorrect: true, marksAwarded: true } },
        },
        orderBy: { startTime: 'desc' },
      }),
    ])

    if (format === 'csv') {
      // Build CSV: one row per attempt, columns = identifier, score, status, start, end, Q1, Q2, ...
      const headers = [
        'Name',
        'Identifier',
        'Score (%)',
        'Status',
        'Started',
        'Submitted',
        ...questions.map((q) => `Q${q.order + 1}`),
      ]
      const rows = attempts.map((a) => {
        const respMap = new Map(a.responses.map((r) => [r.questionId, r]))
        return [
          a.participant.name ?? '',
          a.participant.identifier ?? 'anonymous',
          String(a.totalScore ?? 0),
          a.status,
          a.startTime.toISOString(),
          a.endTime?.toISOString() ?? '',
          ...questions.map((q) => {
            const r = respMap.get(q.id)
            if (!r) return 'skipped'
            if (r.marksAwarded === null) return 'pending'
            return r.isCorrect ? 'correct' : 'wrong'
          }),
        ]
      })

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${test.title.replace(/[^a-z0-9]/gi, '_')}_results.csv"`,
        },
      })
    }

    // JSON
    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        test: { id: test.id, title: test.title },
        questions: questions.map((q) => ({ id: q.id, text: q.questionText, order: q.order })),
        attempts: attempts.map((a) => ({
          id: a.id,
          name: a.participant.name,
          identifier: a.participant.identifier ?? 'anonymous',
          score: a.totalScore,
          status: a.status,
          startedAt: a.startTime.toISOString(),
          submittedAt: a.endTime?.toISOString() ?? null,
          responses: a.responses.map((r) => ({
            questionId: r.questionId,
            isCorrect: r.isCorrect,
            marksAwarded: r.marksAwarded,
          })),
        })),
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/tests/[id]/results]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
