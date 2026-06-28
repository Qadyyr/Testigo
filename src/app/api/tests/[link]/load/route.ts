import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionFromAuthHeader } from '@/lib/session-token'

export const dynamic = 'force-dynamic'

/** Parse a Prisma Json value that may be a string (double-encoded on SQLite)
 *  or already an array, into a real string[]. */
function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.map((x) => String(x))
    } catch {
      /* not JSON */
    }
  }
  return []
}

/**
 * GET /api/tests/{link}/load
 * Loads the questions + any saved answers for an in-progress attempt.
 * Requires a valid Bearer session token (issued by /start).
 *
 * NOTE: correctAnswers are NEVER sent to the client. Only options + the
 * participant's previously-saved answers.
 *
 * 200: { success, data: { test, questions: [{ id, text, type, options, order }], answers: { questionId: userAnswer }, attempt: { startTime, timeLimitMinutes, tabSwitches } } }
 * 401: invalid/missing token
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ link: string }> }
) {
  try {
    const { link } = await ctx.params
    const session = getSessionFromAuthHeader(_req.headers.get('authorization'))
    if (!session) return fail('Unauthorized', 401)

    const test = await db.test.findUnique({
      where: { shareableLink: link },
      select: {
        id: true, title: true, description: true,
        timeLimitMinutes: true, startTime: true, endTime: true, timezone: true,
        positiveMarks: true, negativeMarks: true, partialMarks: true,
      },
    })
    if (!test || test.id !== session.testId) return fail('Test not found', 404)

    const [questions, responses, attempt] = await Promise.all([
      db.question.findMany({
        where: { testId: test.id },
        orderBy: { order: 'asc' },
        select: { id: true, questionText: true, type: true, options: true, positiveMarks: true, negativeMarks: true, order: true },
      }),
      db.response.findMany({
        where: { attemptId: session.attemptId },
        select: { questionId: true, userAnswer: true },
      }),
      db.attempt.findUnique({
        where: { id: session.attemptId },
        select: { startTime: true, status: true, tabSwitches: true },
      }),
    ])

    if (!attempt) return fail('Attempt not found', 404)

    // Build answers map: { questionId: userAnswer }
    const answers: Record<string, unknown> = {}
    for (const r of responses) answers[r.questionId] = r.userAnswer

    return ok({
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        timeLimitMinutes: test.timeLimitMinutes,
        timezone: test.timezone,
        positiveMarks: test.positiveMarks,
        negativeMarks: test.negativeMarks,
        partialMarks: test.partialMarks,
      },
      // Strip correctAnswers — never sent to client.
      // Note: SQLite Json fields may return as a JSON string (double-encoded
      // if inserted via JSON.stringify). Parse to a real array here.
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        type: q.type,
        options: parseJsonArray(q.options),
        positiveMarks: q.positiveMarks,
        negativeMarks: q.negativeMarks,
        order: q.order,
      })),
      answers,
      attempt: {
        startTime: attempt.startTime.toISOString(),
        status: attempt.status,
        tabSwitches: attempt.tabSwitches,
      },
    })
  } catch (err) {
    console.error('[GET /api/tests/[link]/load]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
