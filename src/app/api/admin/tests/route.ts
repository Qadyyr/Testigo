import { NextResponse } from 'next/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail, normalizePhone } from '@/lib/api'
import type { ParsedQuestion } from '@/lib/question-parser'

export const dynamic = 'force-dynamic'

const questionSchema = z.object({
  questionText: z.string().min(1),
  type: z.enum(['MCQ', 'TEXT']),
  options: z.array(z.string()),
  correctAnswers: z.array(z.union([z.number(), z.string()])),
  positiveMarks: z.number().min(0),
  negativeMarks: z.number().min(0),
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
  accessCode: z.string().min(1).max(100).optional(),
  maxAttempts: z.number().int().min(1).default(1),
  resultReleaseMode: z.enum(['IMMEDIATE', 'MANUAL', 'NEVER']).default('IMMEDIATE'),
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

    // Code overlay validation: if requireCode is true, accessCode must be set.
    if (b.requireCode && !b.accessCode) {
      return fail('Access code is required when "Require access code" is enabled', 400)
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
        accessCode: b.requireCode ? b.accessCode! : null,
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
            positiveMarks: q.positiveMarks,
            negativeMarks: q.negativeMarks,
            order: i,
          })),
        },
      },
      include: { _count: { select: { questions: true } } },
    })

    // Access-mode side data.
    let inviteLinks: string[] | undefined
    if (b.accessMode === 'WHITELIST' && b.whitelist) {
      // Dedupe + normalize phones; skip blanks.
      const phones = Array.from(
        new Set(b.whitelist.map(normalizePhone).filter(Boolean))
      )
      if (phones.length > 0) {
        await db.whitelist.createMany({
          data: phones.map((phone) => ({ testId: test.id, phone })),
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
