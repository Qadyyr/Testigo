import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/admins
 * Super Admin only — lists all admin accounts (pending + approved).
 *
 * 200: { success, data: [{ id, email, name, role, status, createdAt }] }
 * 401: unauthorized
 * 403: not a super admin
 */
export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }
    if (session.user.role !== 'SUPER_ADMIN') {
      return fail('Super admin access required', 403)
    }

    const admins = await db.admin.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: admins.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/admins]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
