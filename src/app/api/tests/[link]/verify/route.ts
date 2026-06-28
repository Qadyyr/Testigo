import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, normalizePhone } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  phone: z.string().min(7, 'Enter a valid phone number'),
})

/**
 * POST /api/tests/{link}/verify
 * Checks whether a given phone number is whitelisted for THIS specific test.
 * Used on the participant landing page before allowing a start. (Phase 4 will
 * layer OTP verification on top of this whitelist check.)
 *
 * Body: { phone: string }
 * 200: { success, data: { allowed: boolean } }
 * 404: test not found
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ link: string }> }
) {
  try {
    const { link } = await ctx.params

    const test = await db.test.findUnique({
      where: { shareableLink: link },
      select: { id: true },
    })
    if (!test) {
      return fail('Test not found', 404)
    }

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const phoneNorm = normalizePhone(parsed.data.phone)

    const entry = await db.whitelist.findFirst({
      where: {
        testId: test.id,
        phone: phoneNorm,
      },
      select: { id: true },
    })

    return ok({ allowed: !!entry })
  } catch (err) {
    console.error('[POST /api/tests/[link]/verify]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
