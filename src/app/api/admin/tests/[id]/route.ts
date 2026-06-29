import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  isPublished: z.boolean().optional(),
  title: z.string().min(1).max(200).optional(),
})

/**
 * PATCH /api/admin/tests/{id}
 * Updates a test (toggle publish, rename, etc.).
 *
 * 200: { success, data: { id, isPublished } }
 * 401: unauthorized
 * 404: test not found / not owned
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
    if (!test || (test.createdBy !== session.user.id && session.user.role !== "SUPER_ADMIN")) {
      return fail('Test not found', 404)
    }

    const json = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }

    const updated = await db.test.update({
      where: { id },
      data: {
        ...(parsed.data.isPublished !== undefined && { isPublished: parsed.data.isPublished }),
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      },
      select: { id: true, isPublished: true, title: true },
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
 * Deletes a test and all related data (questions, attempts, responses, etc.)
 * via the cascade relations defined in the schema.
 *
 * 200: { success, message: 'Deleted' }
 * 401: unauthorized
 * 404: test not found / not owned
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
    if (!test || (test.createdBy !== session.user.id && session.user.role !== "SUPER_ADMIN")) {
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
