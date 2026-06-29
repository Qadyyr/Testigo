import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
})

/**
 * POST /api/auth/check-status
 * Public — checks an admin account's approval status (for login pre-check).
 * Does NOT reveal password or whether the email exists (returns null status
 * for non-existent emails so attackers can't enumerate).
 *
 * Body: { email: string }
 * 200: { success, status: 'PENDING' | 'APPROVED' | 'REJECTED' | null }
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail('Invalid input', 400)
    }

    const admin = await db.admin.findUnique({
      where: { email: parsed.data.email.toLowerCase().trim() },
      select: { status: true },
    })

    // Return null for non-existent accounts (don't reveal existence).
    return NextResponse.json({
      success: true,
      status: admin?.status ?? null,
    })
  } catch (err) {
    console.error('[POST /api/auth/check-status]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
