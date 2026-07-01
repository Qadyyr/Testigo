import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Parse a Prisma Json value (may be double-encoded string on Postgres) into an array. */
function parseJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p } catch { /* */ }
  }
  return []
}

/**
 * GET /api/admin/tests/{id}/questions
 * Returns all questions for a test (with correct answers — admin only).
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

    const test = await db.test.findUnique({ where: { id }, select: { createdBy: true } })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Test not found', 404)
    }

    const questions = await db.question.findMany({
      where: { testId: id },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        type: q.type,
        options: parseJsonArray(q.options),
        correctAnswers: parseJsonArray(q.correctAnswers),
        explanation: q.explanation,
        positiveMarks: q.positiveMarks,
        negativeMarks: q.negativeMarks,
        order: q.order,
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/tests/[id]/questions]', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/tests/{id}/questions
 * Add a new question to a test.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }
    const { id } = await ctx.params

    const test = await db.test.findUnique({ where: { id }, select: { createdBy: true, _count: { select: { questions: true } } } })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Test not found', 404)
    }

    const body = await req.json().catch(() => null)
    if (!body) return fail('Invalid input', 400)

    const { questionText, type, options, correctAnswers, explanation, positiveMarks, negativeMarks } = body
    if (!questionText?.trim()) return fail('Question text is required', 400)
    if (!type || !['MCQ', 'TRUE_FALSE', 'SHORT'].includes(type)) return fail('Invalid type', 400)

    const question = await db.question.create({
      data: {
        testId: id,
        questionText: questionText.trim(),
        type,
        options: options || [],
        correctAnswers: correctAnswers || [],
        explanation: explanation || null,
        positiveMarks: positiveMarks ?? 1,
        negativeMarks: negativeMarks ?? 0,
        order: test._count.questions,
      },
    })

    return NextResponse.json({ success: true, message: 'Question added', data: { id: question.id } }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/tests/[id]/questions]', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}
