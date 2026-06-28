import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tests/{id}/grading
 * Returns all pending SHORT responses for manual grading.
 * Each item: { responseId, attemptId, identifier, questionText, questionId,
 *              userAnswer, acceptableAnswers, positiveMarks, marksAwarded }
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
      select: { id: true, createdBy: true },
    })
    if (!test || test.createdBy !== session.user.id) {
      return fail('Test not found', 404)
    }

    const pending = await db.response.findMany({
      where: {
        marksAwarded: null,
        question: { type: 'SHORT', testId: id },
        attempt: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
      },
      include: {
        question: { select: { id: true, questionText: true, correctAnswers: true, positiveMarks: true } },
        attempt: {
          select: {
            id: true,
            participant: { select: { identifier: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const items = pending.map((r) => ({
      responseId: r.id,
      attemptId: r.attempt.id,
      identifier: r.attempt.participant.identifier ?? 'anonymous',
      questionId: r.question.id,
      questionText: r.question.questionText,
      userAnswer: r.userAnswer as string | null,
      acceptableAnswers: r.question.correctAnswers as string[],
      positiveMarks: r.question.positiveMarks,
      marksAwarded: r.marksAwarded,
    }))

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: { pending: items, count: items.length },
    })
  } catch (err) {
    console.error('[GET /api/admin/tests/[id]/grading]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
