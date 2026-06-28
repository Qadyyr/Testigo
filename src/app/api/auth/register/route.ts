import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

/**
 * POST /api/auth/register
 * Public endpoint — a teacher requests an admin account. The account is
 * created with status PENDING; the Super Admin must approve it before the
 * teacher can log in.
 *
 * Body: { name, email, password }
 * 201: { success, message: 'Registration received. Awaiting approval.' }
 * 409: email already exists
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { name, email, password } = parsed.data
    const emailLower = email.toLowerCase().trim()

    // Check if email already exists.
    const existing = await db.admin.findUnique({ where: { email: emailLower } })
    if (existing) {
      return fail('An account with this email already exists', 409)
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await db.admin.create({
      data: {
        email: emailLower,
        passwordHash,
        name,
        role: 'ADMIN',
        status: 'PENDING',
      },
    })

    return NextResponse.json(
      { success: true, message: 'Registration received. Awaiting approval.' },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/auth/register]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
