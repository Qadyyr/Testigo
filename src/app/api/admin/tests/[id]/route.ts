import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  startTime: z.string().datetime().optional().nullable(),
  endTime: z.string().datetime().optional().nullable(),
  timezone: z.string().max(100).optional().nullable(),
  timeLimitMinutes: z.number().int().min(1).optional().nullable(),
  maxAttempts: z.number().int().min(0).optional(),
  resultReleaseMode: z.enum(['IMMEDIATE', 'MANUAL', 'NEVER']).optional(),
  positiveMarks: z.number().min(0).optional(),
  negativeMarks: z.number().min(0).optional(),
  requireCode: z.boolean().optional(),
  isPublished: z.boolean().optional(),
})

/**
 * GET /api/admin/tests/{id}
 * Returns full test details for the edit form.
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
      select: {
        id: true, title: true, description: true,
        startTime: true, endTime: true, timezone: true,
        timeLimitMinutes: true, accessMode: true, requireCode: true,
        accessCode: true, maxAttempts: true, resultReleaseMode: true,
        positiveMarks: true, negativeMarks: true, partialMarks: true,
        isPublished: true, shareableLink: true, createdBy: true,
        _count: { select: { questions: true, attempts: true } },
      },
    })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Test not found', 404)
    }

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        ...test,
        startTime: test.startTime?.toISOString() ?? null,
        endTime: test.endTime?.toISOString() ?? null,
        questionCount: test._count.questions,
        attemptCount: test._count.attempts,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/tests/[id]]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/tests/{id}
 * Updates test settings (title, description, schedule, time limit, marks,
 * max attempts, result release mode, requireCode, isPublished).
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

    const test = await db.test.findUnique({
      where: { id },
      select: { createdBy: true },
    })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Test not found', 404)
    }

    const json = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }

    const b = parsed.data
    if (b.startTime && b.endTime && new Date(b.startTime) >= new Date(b.endTime)) {
      return fail('End time must be after start time', 400)
    }

    const updated = await db.test.update({
      where: { id },
      data: {
        ...(b.title !== undefined && { title: b.title }),
        ...(b.description !== undefined && { description: b.description || null }),
        ...(b.startTime !== undefined && { startTime: b.startTime ? new Date(b.startTime) : null }),
        ...(b.endTime !== undefined && { endTime: b.endTime ? new Date(b.endTime) : null }),
        ...(b.timezone !== undefined && { timezone: b.timezone || null }),
        ...(b.timeLimitMinutes !== undefined && { timeLimitMinutes: b.timeLimitMinutes }),
        ...(b.maxAttempts !== undefined && { maxAttempts: b.maxAttempts }),
        ...(b.resultReleaseMode !== undefined && { resultReleaseMode: b.resultReleaseMode }),
        ...(b.positiveMarks !== undefined && { positiveMarks: b.positiveMarks }),
        ...(b.negativeMarks !== undefined && { negativeMarks: b.negativeMarks }),
        ...(b.requireCode !== undefined && { requireCode: b.requireCode }),
        ...(b.isPublished !== undefined && { isPublished: b.isPublished }),
      },
      select: { id: true, title: true, isPublished: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Updated',
      data: { id: updated.id, isPublished: updated.isPublished, title: updated.title },
    })
  } catch (err) {
    console.error('[PATCH /api/admin/tests/[id]]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/tests/{id}
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

    const test = await db.test.findUnique({
      where: { id },
      select: { createdBy: true },
    })
    if (!test || (test.createdBy !== session.user.id && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Test not found', 404)
    }

    await db.test.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'Deleted' })
  } catch (err) {
    console.error('[DELETE /api/admin/tests/[id]]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
