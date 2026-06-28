import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dryRunParse, type ParseFormat } from '@/lib/question-parser'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  format: z.enum(['csv', 'json', 'md']),
  content: z.string().min(1, 'Content is required'),
})

/**
 * POST /api/admin/tests/dry-run
 * Parses pasted/uploaded question content (CSV, JSON, or Markdown) and returns
 * the valid questions + a row-by-row error list. Nothing is written to the DB.
 *
 * Body: { format: 'csv'|'json'|'md', content: string }
 * 200: { success, data: { valid: ParsedQuestion[], errors: ParseError[], total } }
 * 401: unauthorized
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminSession()
    if (
      !session ||
      (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')
    ) {
      return fail('Unauthorized', 401)
    }

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }

    const result = dryRunParse(
      parsed.data.format as ParseFormat,
      parsed.data.content
    )
    return NextResponse.json({ success: true, message: 'ok', data: result })
  } catch (err) {
    console.error('[POST /api/admin/tests/dry-run]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
