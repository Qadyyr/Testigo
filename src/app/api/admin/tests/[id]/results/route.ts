import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Format seconds into a human-readable duration (e.g. "5m 30s" or "1h 12m"). */
function formatDuration(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * GET /api/admin/tests/{id}/results
 * Returns all attempts for a test with full per-student data:
 *   name, identifier, score, status, startedAt, submittedAt,
 *   durationSeconds, durationLabel, questionsAttempted, questionsTotal
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
    // Pagination: ?limit=20&offset=0 (default: all for CSV, 20 for JSON)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 200) : undefined
    const offset = offsetParam ? parseInt(offsetParam, 10) || 0 : 0

    const test = await db.test.findUnique({
      where: { id },
      select: { id: true, title: true, createdBy: true },
    })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Test not found', 404)
    }

    const whereClause = { testId: id, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } }

    const [questions, attempts, totalCount] = await Promise.all([
      db.question.findMany({
        where: { testId: id },
        orderBy: { order: 'asc' },
        select: { id: true, questionText: true, order: true },
      }),
      db.attempt.findMany({
        where: whereClause,
        include: {
          participant: { select: { identifier: true, name: true } },
          responses: { select: { questionId: true, isCorrect: true, marksAwarded: true, userAnswer: true } },
        },
        orderBy: { startTime: 'desc' },
        ...(limit !== undefined ? { take: limit, skip: offset } : {}),
      }),
      db.attempt.count({ where: whereClause }),
    ])

    const questionsTotal = questions.length

    // Build enriched attempt data.
    const enriched = attempts.map((a) => {
      const durationSeconds = a.endTime
        ? Math.round((a.endTime.getTime() - a.startTime.getTime()) / 1000)
        : null
      // Count attempted questions (has a non-null userAnswer that isn't empty).
      const questionsAttempted = a.responses.filter((r) => {
        if (r.userAnswer === null) return false
        if (Array.isArray(r.userAnswer)) return r.userAnswer.length > 0
        if (typeof r.userAnswer === 'string') return r.userAnswer.trim() !== ''
        return true
      }).length

      return {
        id: a.id,
        name: a.participant.name ?? 'Anonymous',
        identifier: a.participant.identifier ?? '—',
        score: a.totalScore ?? 0,
        status: a.status,
        startedAt: a.startTime.toISOString(),
        submittedAt: a.endTime?.toISOString() ?? null,
        durationSeconds,
        durationLabel: durationSeconds != null ? formatDuration(durationSeconds) : '—',
        questionsAttempted,
        questionsTotal,
        responses: a.responses.map((r) => ({
          questionId: r.questionId,
          isCorrect: r.isCorrect,
          marksAwarded: r.marksAwarded,
        })),
      }
    })

    if (format === 'csv') {
      const headers = [
        'Name',
        'Identifier',
        'Score (%)',
        'Status',
        'Started',
        'Submitted',
        'Duration',
        'Questions Attempted',
        'Questions Total',
        ...questions.map((q) => `Q${q.order + 1}`),
      ]
      const rows = enriched.map((a) => {
        const respMap = new Map(a.responses.map((r) => [r.questionId, r]))
        return [
          a.name,
          a.identifier,
          String(a.score),
          a.status === 'AUTO_SUBMITTED' ? 'Auto-submitted' : 'Submitted',
          a.startedAt,
          a.submittedAt ?? '',
          a.durationLabel,
          String(a.questionsAttempted),
          String(a.questionsTotal),
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
        questionsTotal,
        attempts: enriched,
        totalCount,
        ...(limit !== undefined ? { limit, offset, hasMore: offset + enriched.length < totalCount } : {}),
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
