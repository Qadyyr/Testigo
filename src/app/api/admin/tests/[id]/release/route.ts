import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/tests/{id}/release
 * Releases results for a MANUAL test — sets resultReleaseMode to IMMEDIATE
 * so students can see their scores on revisit.
 * (In production, this would also trigger bulk email via Resend/Inngest.)
 *
 * 200: { success, data: { released: true, attemptCount } }
 * 401: unauthorized
 * 404: test not found / not owned
 */
export async function POST(
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
      select: { id: true, createdBy: true, resultReleaseMode: true },
    })
    if (!test || test.createdBy !== session.user.id) {
      return fail('Test not found', 404)
    }

    const attemptCount = await db.attempt.count({
      where: { testId: id, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
    })

    await db.test.update({
      where: { id },
      data: { resultReleaseMode: 'IMMEDIATE' },
    })

    // TODO (production): trigger Inngest job to send bulk email via Resend
    // to all participants with their individual results.

    return NextResponse.json({
      success: true,
      message: 'Results released',
      data: { released: true, attemptCount },
    })
  } catch (err) {
    console.error('[POST /api/admin/tests/[id]/release]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
