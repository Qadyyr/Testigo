import { NextResponse } from 'next/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail, normalizeIdentifier } from '@/lib/api'
import type { ParsedQuestion } from '@/lib/question-parser'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tests
 * Lists ALL tests owned by the signed-in admin (for the Tests management page).
 *
 * 200: { success, data: [{ id, title, accessMode, requireCode, isPublished,
 *          timeLimitMinutes, resultReleaseMode, createdAt, shareableLink,
 *          accessCode, attemptCount, questionCount }] }
 * 401: unauthorized
 */
export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return fail('Unauthorized', 401)
    }

    // Super Admin sees all tests; regular Admin sees only their own.
    const testFilter = session.user.role === 'SUPER_ADMIN' ? {} : { createdBy: session.user.id }

    const tests = await db.test.findMany({
      where: testFilter,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        accessMode: true,
        requireCode: true,
        accessCode: true,
        isPublished: true,
        timeLimitMinutes: true,
        resultReleaseMode: true,
        createdAt: true,
        shareableLink: true,
        createdBy: true,
        admin: { select: { name: true, email: true } },
        _count: {
          select: { attempts: true, questions: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: tests.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        accessMode: t.accessMode as 'PUBLIC' | 'WHITELIST' | 'INVITE',
        requireCode: t.requireCode,
        accessCode: t.accessCode,
        isPublished: t.isPublished,
        timeLimitMinutes: t.timeLimitMinutes,
        resultReleaseMode: t.resultReleaseMode as 'IMMEDIATE' | 'MANUAL' | 'NEVER',
        createdAt: t.createdAt.toISOString(),
        shareableLink: t.shareableLink,
        ownerName: t.admin.name ?? t.admin.email,
        ownerEmail: t.admin.email,
        attemptCount: t._count.attempts,
        questionCount: t._count.questions,
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/tests]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

const questionSchema = z.object({
  questionText: z.string().min(1),
  type: z.enum(['MCQ', 'TRUE_FALSE', 'SHORT']),
  options: z.array(z.string()),
  correctAnswers: z.array(z.union([z.number(), z.string()])),
  explanation: z.string().nullable().optional(),
})

const bodySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  startTime: z.string().datetime().optional().nullable(),
  endTime: z.string().datetime().optional().nullable(),
  timezone: z.string().max(100).optional().nullable(),
  timeLimitMinutes: z.number().int().positive().optional().nullable(),
  accessMode: z.enum(['PUBLIC', 'WHITELIST', 'INVITE']),
  requireCode: z.boolean().default(false),
  accessCode: z.string().min(1, 'Test code is required').max(100),
  maxAttempts: z.number().int().min(1).default(1),
  resultReleaseMode: z.enum(['IMMEDIATE', 'MANUAL', 'NEVER']).default('IMMEDIATE'),
  // Test-level marks — applied to ALL questions (not in the import format).
  positiveMarks: z.number().min(0).default(1),
  negativeMarks: z.number().min(0).default(0),
  isPublished: z.boolean().default(false),
  questions: z.array(questionSchema).min(1, 'At least one question is required'),
  // Phone numbers for WHITELIST mode.
  whitelist: z.array(z.string()).optional(),
  // Number of single-use invitation links to generate for INVITE mode.
  inviteCount: z.number().int().min(1).max(500).optional(),
})

/**
 * POST /api/admin/tests
 * Creates a test (with questions + access config) and optionally publishes it.
 * Generates an unguessable shareable link (nanoid) + invitation tokens if the
 * INVITE access mode is chosen.
 *
 * 201: { success, data: { id, shareableLink, questionCount, inviteLinks? } }
 * 400: validation error
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
    const b = parsed.data

    // accessCode is required — it's the join code students use on the home page.
    // requireCode controls whether it's ALSO enforced as a password at the gate.
    if (!b.accessCode) {
      return fail('A test code is required (students use it to open the test)', 400)
    }
    if (b.accessMode === 'WHITELIST' && (!b.whitelist || b.whitelist.length === 0)) {
      return fail('At least one phone number is required for WHITELIST mode', 400)
    }
    if (b.accessMode === 'INVITE' && (!b.inviteCount || b.inviteCount < 1)) {
      return fail('inviteCount is required for INVITE mode', 400)
    }
    if (b.startTime && b.endTime && new Date(b.startTime) >= new Date(b.endTime)) {
      return fail('End time must be after start time', 400)
    }

    const shareableLink = nanoid(12)

    const test = await db.test.create({
      data: {
        title: b.title,
        description: b.description ?? null,
        startTime: b.startTime ? new Date(b.startTime) : null,
        endTime: b.endTime ? new Date(b.endTime) : null,
        timezone: b.timezone ?? null,
        timeLimitMinutes: b.timeLimitMinutes ?? null,
        accessMode: b.accessMode,
        requireCode: b.requireCode,
        accessCode: b.accessCode,
        maxAttempts: b.maxAttempts,
        resultReleaseMode: b.resultReleaseMode,
        positiveMarks: b.positiveMarks,
        negativeMarks: b.negativeMarks,
        isPublished: b.isPublished,
        shareableLink,
        createdBy: session.user.id,
        questions: {
          create: (b.questions as ParsedQuestion[]).map((q, i) => ({
            questionText: q.questionText,
            type: q.type,
            options: q.options,
            correctAnswers: q.correctAnswers,
            explanation: q.explanation,
            // Use test-level marks for all questions.
            positiveMarks: b.positiveMarks,
            negativeMarks: b.negativeMarks,
            order: i,
          })),
        },
      },
      include: { _count: { select: { questions: true } } },
    })

    // Access-mode side data.
    let inviteLinks: string[] | undefined
    if (b.accessMode === 'WHITELIST' && b.whitelist) {
      // Dedupe + normalize identifiers (phones); skip blanks.
      const identifiers = Array.from(
        new Set(b.whitelist.map(normalizeIdentifier).filter(Boolean))
      )
      if (identifiers.length > 0) {
        await db.whitelist.createMany({
          data: identifiers.map((identifier) => ({
            testId: test.id,
            identifier,
            identifierType: 'PHONE',
          })),
          skipDuplicates: true,
        })
      }
    } else if (b.accessMode === 'INVITE' && b.inviteCount) {
      const tokens = Array.from({ length: b.inviteCount }, () => nanoid(16))
      await db.invitation.createMany({
        data: tokens.map((token) => ({ testId: test.id, token })),
      })
      inviteLinks = tokens
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Test created',
        data: {
          id: test.id,
          shareableLink: test.shareableLink,
          questionCount: test._count.questions,
          isPublished: test.isPublished,
          inviteLinks,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/admin/tests]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
