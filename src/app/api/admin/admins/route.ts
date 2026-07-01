import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']).default('ADMIN'),
})

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
        _count: { select: { tests: true } },
      },
    })

    // Enrich each admin with real usage stats + last activity timestamps.
    // This is what makes the Super Admin's admin cards data-rich instead of
    // showing only name/email/status.
    const enriched = await Promise.all(
      admins.map(async (a) => {
        const [questionCount, attemptCount, participantCount, lastTest, lastAttempt] =
          await Promise.all([
            db.question.count({ where: { test: { createdBy: a.id } } }),
            db.attempt.count({ where: { test: { createdBy: a.id } } }),
            db.participant.count({ where: { test: { createdBy: a.id } } }),
            db.test.findFirst({
              where: { createdBy: a.id },
              orderBy: { createdAt: 'desc' },
              select: { title: true, createdAt: true },
            }),
            db.attempt.findFirst({
              where: { test: { createdBy: a.id } },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
          ])
        return {
          id: a.id,
          email: a.email,
          name: a.name,
          role: a.role,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          testCount: a._count.tests,
          questionCount,
          attemptCount,
          participantCount,
          lastTestTitle: lastTest?.title ?? null,
          lastTestDate: lastTest?.createdAt.toISOString() ?? null,
          lastAttemptDate: lastAttempt?.createdAt.toISOString() ?? null,
        }
      })
    )

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: enriched,
    })
  } catch (err) {
    console.error('[GET /api/admin/admins]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/admins
 * Super Admin only — creates a new admin account directly (already approved).
 *
 * Body: { name, email, password, role?: 'ADMIN' | 'SUPER_ADMIN' }
 * 201: { success, message, data: { id } }
 * 409: email already exists
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminSession()
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return fail('Super admin access required', 403)
    }

    const json = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { name, email, password, role } = parsed.data
    const emailLower = email.toLowerCase().trim()

    const existing = await db.admin.findUnique({ where: { email: emailLower } })
    if (existing) {
      return fail('An account with this email already exists', 409)
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const admin = await db.admin.create({
      data: {
        email: emailLower,
        passwordHash,
        name,
        role,
        status: 'APPROVED', // directly approved — created by super admin
      },
      select: { id: true, email: true, name: true, role: true, status: true },
    })

    return NextResponse.json(
      { success: true, message: 'Admin account created', data: admin },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/admin/admins]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
