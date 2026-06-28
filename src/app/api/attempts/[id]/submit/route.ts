import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionFromAuthHeader } from '@/lib/session-token'

export const dynamic = 'force-dynamic'

/** Parse a Prisma Json value (may be double-encoded string on SQLite) into an array. */
function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.map((x) => String(x))
    } catch {
      /* not JSON */
    }
  }
  return []
}

const bodySchema = z.object({
  // Optional final batch of answers to flush before grading.
  answers: z
    .record(z.string(), z.union([z.array(z.number()), z.string(), z.null()]))
    .optional(),
  tabSwitches: z.number().int().min(0).optional(),
  auto: z.boolean().default(false), // true = auto-submitted (time up / tab-switch)
})

/**
 * POST /api/attempts/{id}/submit
 * Finalizes an attempt: flushes any final answers, grades MCQ questions
 * instantly, computes the total score (0-100 %), and marks the attempt
 * submitted. TEXT questions are left with marksAwarded=null (pending manual
 * review — Phase 5).
 *
 * Requires a valid Bearer session token whose attemptId matches {id}.
 *
 * 200: { success, data: { score, total, correct, pending, resultMode, showResults, answers } }
 *   - score: 0-100 percentage
 *   - correct: number of MCQs graded correct
 *   - total: total questions
 *   - pending: number of TEXT questions awaiting manual grading
 *   - showResults: whether the participant should see their score (IMMEDIATE only)
 *   - answers: per-question { questionId, userAnswer, isCorrect, marksAwarded } (only if showResults)
 * 401/403: auth errors
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: attemptId } = await ctx.params
    const session = getSessionFromAuthHeader(req.headers.get('authorization'))
    if (!session) return fail('Unauthorized', 401)
    if (session.attemptId !== attemptId) return fail('Forbidden', 403)

    const json = await req.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { answers, tabSwitches, auto } = parsed.data

    const attempt = await db.attempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          select: {
            id: true, timeLimitMinutes: true, resultReleaseMode: true,
            positiveMarks: true, negativeMarks: true, partialMarks: true,
          },
        },
      },
    })
    if (!attempt) return fail('Attempt not found', 404)
    if (attempt.status !== 'IN_PROGRESS') {
      // Already submitted — return the existing result.
      return existingResult(attempt, attempt.test)
    }

    // Backend time-validation: if time's up, force auto-submit.
    const now = new Date()
    let forcedAuto = auto
    if (attempt.test.timeLimitMinutes) {
      const elapsedMs = now.getTime() - attempt.startTime.getTime()
      if (elapsedMs >= attempt.test.timeLimitMinutes * 60_000) forcedAuto = true
    }

    // Flush the final answer batch (if provided).
    if (answers) {
      for (const [questionId, answer] of Object.entries(answers)) {
        await db.response.upsert({
          where: { attemptId_questionId: { attemptId, questionId } },
          update: { userAnswer: answer ?? Prisma.JsonNull, updatedAt: now },
          create: { attemptId, questionId, userAnswer: answer ?? Prisma.JsonNull },
        })
      }
    }

    // Load all questions + responses for grading.
    const [questions, responses] = await Promise.all([
      db.question.findMany({
        where: { testId: attempt.testId },
        orderBy: { order: 'asc' },
      }),
      db.response.findMany({ where: { attemptId } }),
    ])

    const responseMap = new Map(responses.map((r) => [r.questionId, r]))

    let obtainedMarks = 0
    let maxMarks = 0
    let correctCount = 0
    let pendingCount = 0
    const gradedAnswers: Array<{
      questionId: string
      questionText: string
      type: string
      options: string[]
      userAnswer: number[] | string | null
      correctAnswers: number[] | string[]
      isCorrect: boolean | null
      marksAwarded: number | null
      positiveMarks: number
      negativeMarks: number
    }> = []

    for (const q of questions) {
      const opts = parseJsonArray(q.options)
      const correctIdx = parseJsonArray(q.correctAnswers).map((n) => Number(n)).filter((n) => Number.isFinite(n))
      const response = responseMap.get(q.id)
      const userAnswer = response?.userAnswer

      maxMarks += q.positiveMarks

      if (q.type === 'MCQ') {
        const selected = (userAnswer as number[] | null) ?? []
        // Grading logic: exact match (or partial if test.partialMarks).
        const correctSet = new Set(correctIdx)
        const selectedSet = new Set(selected)
        const isExact =
          selectedSet.size === correctSet.size &&
          [...selectedSet].every((i) => correctSet.has(i))

        let marks = 0
        let isCorrect = false
        if (isExact && selected.length > 0) {
          marks = q.positiveMarks
          isCorrect = true
          correctCount++
        } else if (attempt.test.partialMarks && selected.length > 0) {
          // Partial: +pos for each correct selected, -neg for each wrong selected.
          const correctSelected = [...selectedSet].filter((i) => correctSet.has(i)).length
          const wrongSelected = selectedSet.size - correctSelected
          const perCorrect = q.positiveMarks / Math.max(correctIdx.length, 1)
          marks = correctSelected * perCorrect - wrongSelected * q.negativeMarks
          marks = Math.max(0, Math.min(marks, q.positiveMarks))
          isCorrect = correctSelected > 0 && wrongSelected === 0
        } else if (selected.length > 0) {
          marks = -q.negativeMarks
        }
        obtainedMarks += marks

        gradedAnswers.push({
          questionId: q.id,
          questionText: q.questionText,
          type: q.type,
          options: opts,
          userAnswer: (userAnswer as number[] | null) ?? null,
          correctAnswers: correctIdx,
          isCorrect,
          marksAwarded: marks,
          positiveMarks: q.positiveMarks,
          negativeMarks: q.negativeMarks,
        })
        await db.response.update({
          where: { attemptId_questionId: { attemptId, questionId: q.id } },
          data: { isCorrect, marksAwarded: marks },
        })
      } else {
        // TEXT — pending manual review. Auto-match against acceptable answers
        // as a convenience (marks a quick win if exact match), but leave
        // marksAwarded null so the teacher can override.
        const acceptable = parseJsonArray(q.correctAnswers)
        const textAnswer = (userAnswer as string | null)?.trim().toLowerCase() ?? ''
        const autoMatch = textAnswer !== '' && acceptable.some((a) => a.trim().toLowerCase() === textAnswer)
        pendingCount++
        gradedAnswers.push({
          questionId: q.id,
          questionText: q.questionText,
          type: q.type,
          options: [],
          userAnswer: (userAnswer as string | null) ?? null,
          correctAnswers: acceptable,
          isCorrect: autoMatch ? true : null,
          marksAwarded: null,
          positiveMarks: q.positiveMarks,
          negativeMarks: q.negativeMarks,
        })
        await db.response.update({
          where: { attemptId_questionId: { attemptId, questionId: q.id } },
          data: { isCorrect: autoMatch ? true : null, marksAwarded: null },
        })
      }
    }

    const score = maxMarks > 0 ? Math.round((obtainedMarks / maxMarks) * 100) : 0
    const status = forcedAuto ? 'AUTO_SUBMITTED' : 'SUBMITTED'

    await db.attempt.update({
      where: { id: attemptId },
      data: {
        status,
        endTime: now,
        totalScore: score,
        tabSwitches: tabSwitches ?? attempt.tabSwitches,
      },
    })

    const showResults = attempt.test.resultReleaseMode === 'IMMEDIATE' && pendingCount === 0

    return ok({
      score,
      total: questions.length,
      correct: correctCount,
      pending: pendingCount,
      resultMode: attempt.test.resultReleaseMode,
      showResults,
      autoSubmitted: forcedAuto,
      answers: showResults ? gradedAnswers : undefined,
    })
  } catch (err) {
    console.error('[POST /api/attempts/[id]/submit]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ---- helpers ---------------------------------------------------------------

async function existingResult(
  attempt: { id: string; status: string; totalScore: number | null; testId: string },
  test: { resultReleaseMode: string }
) {
  const pendingCount = await db.response.count({
    where: { attemptId: attempt.id, marksAwarded: null, question: { type: 'TEXT' } },
  })
  const showResults = test.resultReleaseMode === 'IMMEDIATE' && pendingCount === 0
  return ok({
    score: attempt.totalScore,
    total: await db.question.count({ where: { testId: attempt.testId } }),
    correct: null,
    pending: pendingCount,
    resultMode: test.resultReleaseMode,
    showResults,
    autoSubmitted: attempt.status === 'AUTO_SUBMITTED',
    alreadySubmitted: true,
  })
}
