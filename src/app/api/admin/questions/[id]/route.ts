import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/questions/{id}
 * Edit a single question (text, type, options, correctAnswers, explanation, marks).
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

    const question = await db.question.findUnique({
      where: { id },
      select: { test: { select: { createdBy: true } } },
    })
    if (!question) return fail('Question not found', 404)
    if (question.test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN') {
      return fail('Not found', 404)
    }

    const body = await req.json().catch(() => null)
    if (!body) return fail('Invalid input', 400)

    const { questionText, type, options, correctAnswers, explanation, positiveMarks, negativeMarks } = body

    const updated = await db.question.update({
      where: { id },
      data: {
        ...(questionText !== undefined && { questionText: questionText.trim() }),
        ...(type !== undefined && { type }),
        ...(options !== undefined && { options }),
        ...(correctAnswers !== undefined && { correctAnswers }),
        ...(explanation !== undefined && { explanation: explanation || null }),
        ...(positiveMarks !== undefined && { positiveMarks }),
        ...(negativeMarks !== undefined && { negativeMarks }),
      },
    })

    return NextResponse.json({ success: true, message: 'Question updated', data: { id: updated.id } })
  } catch (err) {
    console.error('[PATCH /api/admin/questions/[id]]', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/questions/{id}
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }
    const { id } = await ctx.params

    const question = await db.question.findUnique({
      where: { id },
      select: { test: { select: { createdBy: true } } },
    })
    if (!question) return fail('Question not found', 404)
    if (question.test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN') {
      return fail('Not found', 404)
    }

    await db.question.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'Question deleted' })
  } catch (err) {
    console.error('[DELETE /api/admin/questions/[id]]', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}
