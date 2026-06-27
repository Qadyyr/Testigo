import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, normalizeEmail, normalizePhone } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(5).optional(),
  })
  .refine((d) => d.email || d.phone, {
    message: 'Email or phone is required',
  })

/**
 * POST /api/tests/lookup
 * Participant entry point on the home page. Given an email OR phone, returns
 * the published, not-yet-closed tests this participant is whitelisted for.
 *
 * Body: { email?: string, phone?: string }
 * 200: { success, data: { count, tests: [{ id, title, shareableLink }] } }
 *   - count === 0 → no tests found for this identity
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
    const { email, phone } = parsed.data
    const emailLower = email ? normalizeEmail(email) : undefined
    const phoneNorm = phone ? normalizePhone(phone) : undefined

    const now = new Date()
    const tests = await db.test.findMany({
      where: {
        isPublished: true,
        // Don't surface tests whose schedule has already closed.
        OR: [{ endTime: null }, { endTime: { gt: now } }],
        whitelists: {
          some: {
            OR: [
              ...(emailLower ? [{ email: emailLower }] : []),
              ...(phoneNorm ? [{ phone: phoneNorm }] : []),
            ],
          },
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
