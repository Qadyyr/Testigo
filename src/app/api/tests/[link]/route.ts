import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tests/{link}
 * Public endpoint — fetches a test by its shareable link token for the
 * participant landing page. Does NOT reveal answers or questions; only the
 * details needed to render the landing + rules.
 *
 * Response 200: { success: true, data: { ...testDetails, scheduledOpen, scheduledClosed } }
 * Response 404: { success: false, message: "Test not found" }
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ link: string }> }
) {
  try {
    const { link } = await ctx.params

    const test = await db.test.findUnique({
      where: { shareableLink: link },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        timezone: true,
        timeLimitMinutes: true,
        accessMode: true,
        requireCode: true,
        maxAttempts: true,
        resultReleaseMode: true,
        isPublished: true,
      },
    })

    if (!test) {
      return NextResponse.json(
        { success: false, message: 'Test not found' },
        { status: 404 }
      )
    }

    // Backend-computed schedule flags — never trust client clocks.
    const now = Date.now()
    const scheduledOpen = test.startTime
      ? now >= test.startTime.getTime()
      : true
    const scheduledClosed = test.endTime ? now > test.endTime.getTime() : false

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        id: test.id,
        title: test.title,
        description: test.description,
        startTime: test.startTime?.toISOString() ?? null,
        endTime: test.endTime?.toISOString() ?? null,
        timezone: test.timezone,
        timeLimitMinutes: test.timeLimitMinutes,
        accessMode: test.accessMode as 'PUBLIC' | 'WHITELIST' | 'INVITE',
        requireCode: test.requireCode,
        isPublic: test.accessMode === 'PUBLIC',
        maxAttempts: test.maxAttempts,
        resultReleaseMode: test.resultReleaseMode as 'IMMEDIATE' | 'MANUAL' | 'NEVER',
        isPublished: test.isPublished,
        scheduledOpen,
        scheduledClosed,
      },
    })
  } catch (err) {
    console.error('[GET /api/tests/[link]]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
