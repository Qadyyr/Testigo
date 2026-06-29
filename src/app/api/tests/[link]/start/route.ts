import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, normalizeIdentifier } from '@/lib/api'
import { signSessionToken } from '@/lib/session-token'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200).optional(),
  identifier: z.string().optional(), // phone for WHITELIST; optional for PUBLIC
  accessCode: z.string().optional(), // required only if test.requireCode
  inviteToken: z.string().optional(), // required only for INVITE mode
})

/**
 * POST /api/tests/{link}/start
 * The participant access GATE. Performs the sequential checks (per spec):
 *   1. Test link valid + published?
 *   2. Within scheduled window? (not-before-start, not-after-end)
 *   3. Whitelist check (if WHITELIST mode)?
 *   4. Access code check (if requireCode)?
 *   5. Already-submitted check? (maxAttempts)
 *   6. (INVITE) consume the single-use invite token.
 * On success: creates a Participant (if needed) + an Attempt (status
 * IN_PROGRESS, startTime = now), and issues a signed session JWT. The frontend
 * stores the token and sends it as Bearer on load/save/submit.
 *
 * 200: { success, data: { token, attemptId, expiresAt, resumed } }
 * 4xx: { success: false, message } with a machine-friendly `code` field.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ link: string }> }
) {
  try {
    const { link } = await ctx.params
    const json = await req.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { name, identifier, accessCode, inviteToken } = parsed.data

    // 1. Valid + published?
    const test = await db.test.findUnique({
      where: { shareableLink: link },
      include: { _count: { select: { questions: true } } },
    })
    if (!test || !test.isPublished) {
      return fail('Test not found', 404)
    }
    if (test._count.questions === 0) {
      return fail('This test has no questions yet.', 400)
    }

    // 2. Scheduled window.
    const now = new Date()
    if (test.startTime && now < test.startTime) {
      return NextResponse.json(
        { success: false, message: 'Test has not started yet.', code: 'NOT_STARTED', startsAt: test.startTime.toISOString() },
        { status: 400 }
      )
    }
    if (test.endTime && now > test.endTime) {
      return NextResponse.json(
        { success: false, message: 'Test is closed.', code: 'CLOSED' },
        { status: 400 }
      )
    }

    // 3. Mode-specific identity + whitelist checks.
    let resolvedIdentifier: string | null = null

    if (test.accessMode === 'WHITELIST') {
      if (!identifier) {
        return NextResponse.json(
          { success: false, message: 'Identifier required.', code: 'IDENTIFIER_REQUIRED' },
          { status: 400 }
        )
      }
      resolvedIdentifier = normalizeIdentifier(identifier)
      const wl = await db.whitelist.findUnique({
        where: { testId_identifier: { testId: test.id, identifier: resolvedIdentifier } },
      })
      if (!wl) {
        return NextResponse.json(
          { success: false, message: 'You are not registered for this test.', code: 'NOT_WHITELISTED' },
          { status: 403 }
        )
      }
    } else if (test.accessMode === 'INVITE') {
      if (!inviteToken) {
        return NextResponse.json(
          { success: false, message: 'Invitation link required.', code: 'INVITE_REQUIRED' },
          { status: 400 }
        )
      }
      const inv = await db.invitation.findUnique({ where: { token: inviteToken } })
      if (!inv || inv.testId !== test.id) {
        return NextResponse.json(
          { success: false, message: 'Invalid invitation link.', code: 'INVALID_INVITE' },
          { status: 403 }
        )
      }
      if (inv.usedAt) {
        return NextResponse.json(
          { success: false, message: 'This invitation link has already been used.', code: 'INVITE_USED' },
          { status: 403 }
        )
      }
      // Consume the token.
      await db.invitation.update({ where: { id: inv.id }, data: { usedAt: now } })
      resolvedIdentifier = inv.token // identity = the invite token
    } else {
      // PUBLIC — identifier optional (may be collected for records).
      if (identifier) resolvedIdentifier = normalizeIdentifier(identifier)
    }

    // 4. Access code overlay.
    if (test.requireCode) {
      if (!accessCode) {
        return NextResponse.json(
          { success: false, message: 'Access code required.', code: 'CODE_REQUIRED' },
          { status: 400 }
        )
      }
      if (accessCode.trim() !== test.accessCode) {
        return NextResponse.json(
          { success: false, message: 'Incorrect access code.', code: 'BAD_CODE' },
          { status: 403 }
        )
      }
    }

    // 5. Already-submitted / max-attempts check.
    // Find-or-create the participant for this test + identifier.
    let participantId: string
    if (resolvedIdentifier) {
      const participant = await db.participant.upsert({
        where: { testId_identifier: { testId: test.id, identifier: resolvedIdentifier } },
        update: { name: name ?? undefined },
        create: {
          testId: test.id,
          name: name ?? null,
          identifier: resolvedIdentifier,
          identifierType: 'PHONE',
        },
        include: { attempts: { where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'IN_PROGRESS'] } }, select: { id: true, status: true, startTime: true } } },
      })
      participantId = participant.id

      // Resume an in-progress attempt if one exists (network recovery / refresh).
      const inProgress = participant.attempts.find((a) => a.status === 'IN_PROGRESS')
      if (inProgress) {
        // Validate the in-progress attempt hasn't exceeded the time limit.
        if (test.timeLimitMinutes) {
          const elapsedMs = now.getTime() - inProgress.startTime.getTime()
          if (elapsedMs >= test.timeLimitMinutes * 60_000) {
            // Time's up — auto-submit it and block a new start.
            await autoSubmit(db, inProgress.id, test.id)
            return NextResponse.json(
              { success: false, message: 'Your time is up. The test has been auto-submitted.', code: 'TIME_UP' },
              { status: 400 }
            )
          }
        }
        const expiresIn = tokenExpirySeconds(test, inProgress.startTime, now)
        const token = signSessionToken({ testId: test.id, attemptId: inProgress.id, identifier: resolvedIdentifier }, expiresIn)
        return ok({ token, attemptId: inProgress.id, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), resumed: true })
      }

      // Already submitted the max attempts? (0 = unlimited, skip check)
      const submittedCount = participant.attempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED').length
      if (test.maxAttempts > 0 && submittedCount >= test.maxAttempts) {
        return NextResponse.json(
          { success: false, message: 'You have already attempted this test.', code: 'ALREADY_ATTEMPTED' },
          { status: 400 }
        )
      }
    } else {
      // Public + no identifier — create an anonymous participant (with name).
      const participant = await db.participant.create({
        data: { testId: test.id, name: name ?? null, identifierType: 'PHONE' },
      })
      participantId = participant.id
    }

    // 6. Create the attempt — startTime is the backend source of truth.
    const attempt = await db.attempt.create({
      data: { testId: test.id, participantId, startTime: now, status: 'IN_PROGRESS' },
    })

    const expiresIn = tokenExpirySeconds(test, attempt.startTime, now)
    const token = signSessionToken({ testId: test.id, attemptId: attempt.id, identifier: resolvedIdentifier }, expiresIn)

    return NextResponse.json(
      { success: true, message: 'started', data: { token, attemptId: attempt.id, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), resumed: false } },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/tests/[link]/start]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ---- helpers ---------------------------------------------------------------

function tokenExpirySeconds(test: { timeLimitMinutes: number | null }, startTime: Date, now: Date): number {
  if (!test.timeLimitMinutes) return 60 * 60 * 6 // 6h buffer for untimed tests
  const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000)
  return Math.max(test.timeLimitMinutes * 60 - elapsed + 60, 60) // +60s buffer, min 60s
}

/** Auto-submit an expired in-progress attempt. Grading happens in the submit route logic; here we just close it. */
async function autoSubmit(dbx: typeof db, attemptId: string, _testId: string) {
  await dbx.attempt.update({
    where: { id: attemptId },
    data: { status: 'AUTO_SUBMITTED', endTime: new Date() },
  })
  // Full grading is performed by the submit flow; for the resume-time edge case
  // we mark AUTO_SUBMITTED and let the submit route's grading logic run when the
  // participant revisits. (A background job would finalize grading — Phase 5.)
}
