import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionFromAuthHeader } from '@/lib/session-token'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  questionId: z.string().min(1),
  // MCQ → number[] (selected indices); TEXT → string; null = cleared.
  answer: z.union([z.array(z.number()), z.string(), z.null()]).optional(),
})

/**
 * PATCH /api/attempts/{id}/save
 * Auto-save a single answer to the server. Upserts the Response row.
 * Requires a valid Bearer session token whose attemptId matches {id}.
 *
 * Body: { questionId, answer }
 * 200: { success, data: { saved: true } }
 * 401: invalid token
 * 403: attempt doesn't belong to token / already submitted
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: attemptId } = await ctx.params
    const session = getSessionFromAuthHeader(req.headers.get('authorization'))
    if (!session) return fail('Unauthorized', 401)
    if (session.attemptId !== attemptId) return fail('Forbidden', 403)

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { questionId, answer } = parsed.data

    // Guard: attempt must still be in progress.
    const attempt = await db.attempt.findUnique({
      where: { id: attemptId },
      select: { status: true, testId: true },
    })
    if (!attempt) return fail('Attempt not found', 404)
    if (attempt.status !== 'IN_PROGRESS') {
      return fail('Attempt is no longer in progress', 400)
    }

    // Validate question belongs to the test.
    const question = await db.question.findUnique({
      where: { id: questionId },
      select: { testId: true },
    })
    if (!question || question.testId !== attempt.testId) {
      return fail('Question not found', 404)
    }

    await db.response.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { userAnswer: answer ?? Prisma.JsonNull, updatedAt: new Date() },
      create: { attemptId, questionId, userAnswer: answer ?? Prisma.JsonNull },
    })

    return ok({ saved: true })
  } catch (err) {
    console.error('[PATCH /api/attempts/[id]/save]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
