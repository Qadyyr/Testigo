import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

/**
 * POST /api/admin/change-password
 * Changes the signed-in admin's password.
 *
 * Body: { currentPassword, newPassword }
 * 200: { success, message: 'Password updated' }
 * 400: validation error
 * 401: unauthorized
 * 403: current password incorrect
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { currentPassword, newPassword } = parsed.data

    const admin = await db.admin.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    })
    if (!admin) return fail('Admin not found', 404)

    const ok = await bcrypt.compare(currentPassword, admin.passwordHash)
    if (!ok) {
      return fail('Current password is incorrect', 403)
    }

    const newHash = await bcrypt.hash(newPassword, 10)
    await db.admin.update({
      where: { id: admin.id },
      data: { passwordHash: newHash },
    })

    return NextResponse.json({ success: true, message: 'Password updated' })
  } catch (err) {
    console.error('[POST /api/admin/change-password]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
