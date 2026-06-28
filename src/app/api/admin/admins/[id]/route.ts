import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  action: z.enum(['approve', 'reject', 'delete', 'promote', 'demote']),
})

/**
 * PATCH /api/admin/admins/{id}
 * Super Admin only — approve / reject / promote / demote an admin account.
 *
 * Body: { action: 'approve' | 'reject' | 'promote' | 'demote' }
 * 200: { success, message }
 * 401/403: unauthorized
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return fail('Super admin access required', 403)
    }
    const { id } = await ctx.params

    const json = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { action } = parsed.data

    // Prevent self-modification (can't demote/delete yourself).
    if (id === session.user.id && (action === 'demote' || action === 'delete')) {
      return fail('You cannot demote or delete your own account', 400)
    }

    const target = await db.admin.findUnique({ where: { id } })
    if (!target) return fail('Admin not found', 404)

    switch (action) {
      case 'approve':
        await db.admin.update({ where: { id }, data: { status: 'APPROVED' } })
        return NextResponse.json({ success: true, message: 'Account approved' })
      case 'reject':
        await db.admin.update({ where: { id }, data: { status: 'REJECTED' } })
        return NextResponse.json({ success: true, message: 'Account rejected' })
      case 'promote':
        await db.admin.update({ where: { id }, data: { role: 'SUPER_ADMIN' } })
        return NextResponse.json({ success: true, message: 'Promoted to super admin' })
      case 'demote':
        await db.admin.update({ where: { id }, data: { role: 'ADMIN' } })
        return NextResponse.json({ success: true, message: 'Demoted to admin' })
      case 'delete':
        await db.admin.delete({ where: { id } })
        return NextResponse.json({ success: true, message: 'Account deleted' })
    }
  } catch (err) {
    console.error('[PATCH /api/admin/admins/[id]]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
