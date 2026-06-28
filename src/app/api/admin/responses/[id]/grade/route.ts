import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  marksAwarded: z.number().min(0, 'Marks must be ≥ 0'),
  isCorrect: z.boolean().optional(),
})

/**
 * PATCH /api/admin/responses/{id}/grade
 * Grade a single SHORT response (manual grading).
 * Recomputes the attempt's total score after grading.
 *
 * Body: { marksAwarded: number, isCorrect?: boolean }
 * 200: { success, data: { attemptId, newScore } }
 * 401: unauthorized
 * 404: response not found / not owned
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }
    const { id } = await ctx.params

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { marksAwarded, isCorrect } = parsed.data

    // Load the response + verify ownership (via test.createdBy)
    const response = await db.response.findUnique({
      where: { id },
      include: {
        question: { select: { positiveMarks: true, testId: true } },
        attempt: { select: { id: true, testId: true } },
      },
    })
    if (!response) return fail('Response not found', 404)

    const test = await db.test.findUnique({
      where: { id: response.question.testId },
      select: { createdBy: true },
    })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== "SUPER_ADMIN")) {
      return fail('Not found', 404)
    }

    // Cap marks at positiveMarks
    const cappedMarks = Math.min(marksAwarded, response.question.positiveMarks)

    await db.response.update({
      where: { id },
      data: { marksAwarded: cappedMarks, isCorrect: isCorrect ?? (cappedMarks > 0) },
    })

    // Recompute the attempt's total score
    const allResponses = await db.response.findMany({
      where: { attemptId: response.attempt.id },
      include: { question: { select: { positiveMarks: true } } },
    })
    const allQuestions = await db.question.findMany({
      where: { testId: response.attempt.testId },
      select: { id: true, positiveMarks: true },
    })
    const maxMarks = allQuestions.reduce((s, q) => s + q.positiveMarks, 0)
    const obtained = allResponses.reduce((s, r) => s + (r.marksAwarded ?? 0), 0)
    const newScore = maxMarks > 0 ? Math.round((obtained / maxMarks) * 100) : 0

    await db.attempt.update({
      where: { id: response.attempt.id },
      data: { totalScore: newScore },
    })

    return NextResponse.json({
      success: true,
      message: 'Graded',
      data: { attemptId: response.attempt.id, newScore },
    })
  } catch (err) {
    console.error('[PATCH /api/admin/responses/[id]/grade]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
