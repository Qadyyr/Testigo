import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  code: z.string().trim().min(1, 'Code is required'),
})

/**
 * POST /api/tests/resolve-code
 * Student enters a test code on the home page → resolves to the test's
 * shareable link. The code is matched against Test.accessCode (the unique
 * code the admin sets). Only published, not-yet-closed tests are returned.
 *
 * Body: { code: string }
 * 200: { success, data: { shareableLink, requireCode } }
 * 404: no test found for that code
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { code } = parsed.data

    const now = new Date()
    const test = await db.test.findFirst({
      where: {
        isPublished: true,
        accessCode: code,
        // Don't surface tests whose schedule has already closed.
        OR: [{ endTime: null }, { endTime: { gt: now } }],
      },
      select: { shareableLink: true, requireCode: true },
    })

    if (!test) {
      return fail('No test found for that code', 404)
    }

    return ok({
      shareableLink: test.shareableLink,
      requireCode: test.requireCode,
    })
  } catch (err) {
    console.error('[POST /api/tests/resolve-code]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
