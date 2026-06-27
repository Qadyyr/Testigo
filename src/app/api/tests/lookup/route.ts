import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, normalizePhone } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  phone: z.string().min(7, 'Enter a valid phone number'),
})

/**
 * POST /api/tests/lookup
 * Participant entry point on the home page. Given a phone number, returns the
 * published, not-yet-closed tests this participant is whitelisted for.
 *
 * Body: { phone: string }
 * 200: { success, data: { count, tests: [{ id, title, shareableLink }] } }
 *   - count === 0 → no tests found for this number
 *   - count === 1 → client navigates directly to that test's shareableLink
 *   - count  >  1 → client asks for a per-test code (see /api/tests/resolve)
 * 400: validation error
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const phoneNorm = normalizePhone(parsed.data.phone)

    const now = new Date()
    const tests = await db.test.findMany({
      where: {
        isPublished: true,
        // Don't surface tests whose schedule has already closed.
        OR: [{ endTime: null }, { endTime: { gt: now } }],
        whitelists: {
          some: { phone: phoneNorm },
        },
      },
      select: { id: true, title: true, shareableLink: true },
      orderBy: { title: 'asc' },
    })

    return ok({
      count: tests.length,
      tests: tests.map((t) => ({
        id: t.id,
        title: t.title,
        shareableLink: t.shareableLink,
      })),
    })
  } catch (err) {
    console.error('[POST /api/tests/lookup]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
