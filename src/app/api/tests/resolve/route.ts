import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, normalizePhone } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  phone: z.string().min(7, 'Enter a valid phone number'),
  code: z.string().trim().min(1, 'Code is required'),
})

/**
 * POST /api/tests/resolve
 * Used when a participant is whitelisted for MORE THAN ONE test. They enter a
 * per-test code (set by the admin) to select which test to open. The code is
 * matched only against tests this participant is actually whitelisted for.
 *
 * Body: { phone: string, code: string }
 * 200: { success, data: { shareableLink } }
 * 404: invalid code for this participant
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { code } = parsed.data
    const phoneNorm = normalizePhone(parsed.data.phone)

    const test = await db.test.findFirst({
      where: {
        isPublished: true,
        accessCode: code,
        whitelists: {
          some: { phone: phoneNorm },
        },
      },
      select: { shareableLink: true },
    })

    if (!test) {
      return fail('Invalid code for this participant', 404)
    }

    return ok({ shareableLink: test.shareableLink })
  } catch (err) {
    console.error('[POST /api/tests/resolve]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
