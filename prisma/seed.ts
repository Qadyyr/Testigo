/**
 * Seed script for Testigo (Phase 4 access model — Option B + generic identifier).
 * Run with:  bun prisma/seed.ts
 *
 * Access model (Option B — primary gate + optional code overlay):
 *   accessMode: PUBLIC | WHITELIST | INVITE
 *   requireCode: boolean (+ accessCode when true)
 *
 * Creates:
 *   - SUPER_ADMIN: admin@testigo.test / admin1234
 *   - Test A "Sample General Knowledge Quiz" — WHITELIST + code GK2024
 *       student phone +923001234567 is whitelisted
 *   - Test B "Sample Aptitude Assessment" — WHITELIST + code APT2024
 *       same student whitelisted (so multi-test → code flow is demonstrable)
 *   - Test C "Public Practice Quiz" — PUBLIC, no code
 *       anyone with the link can take it (has 2 MCQ questions so auto-grading is testable)
 */
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { db } from '../src/lib/db'

async function main() {
  const email = 'qadyyr@gmail.com'
  const password = 'Q@deer00'
  const passwordHash = await bcrypt.hash(password, 10)

  const admin = await db.admin.upsert({
    where: { email },
    update: { passwordHash, role: 'SUPER_ADMIN' },
    create: {
      email,
      passwordHash,
      name: 'Qadyyr',
      role: 'SUPER_ADMIN',
    },
  })

  // Shared participant phone, whitelisted on Tests A + B.
  const studentPhone = '+923001234567'

  // Clear stale data for idempotency.
  await db.whitelist.deleteMany({})
  await db.invitation.deleteMany({})
  await db.response.deleteMany({})
  await db.attempt.deleteMany({})
  await db.participant.deleteMany({})
  await db.question.deleteMany({})
  await db.test.deleteMany({ where: { createdBy: admin.id } })

  const tests = [
    {
      link: 'demo123',
      code: 'GK4MP7',
      requireCode: true,
      accessMode: 'WHITELIST',
      title: 'Sample General Knowledge Quiz',
      description:
        'A short demonstration quiz. Real questions arrive with the Phase 2 import wizard.',
      timeLimitMinutes: 15,
    },
    {
      link: 'demo456',
      code: 'AP3K9X',
      requireCode: true,
      accessMode: 'WHITELIST',
      title: 'Sample Aptitude Assessment',
      description:
        'A second demonstration test sharing the same participant, so the multi-test code flow can be tried.',
      timeLimitMinutes: 20,
    },
    {
      link: 'pubdemo',
      code: 'PU8B2N',
      requireCode: false,
      accessMode: 'PUBLIC',
      title: 'Public Practice Quiz',
      description:
        'An open practice quiz — anyone with the link or code can take it. Two MCQ questions for testing auto-grading.',
      timeLimitMinutes: 10,
    },
  ]

  for (const t of tests) {
    const test = await db.test.create({
      data: {
        title: t.title,
        description: t.description,
        timeLimitMinutes: t.timeLimitMinutes,
        accessMode: t.accessMode,
        requireCode: t.requireCode,
        accessCode: t.code,
        maxAttempts: 1,
        resultReleaseMode: 'IMMEDIATE',
        positiveMarks: 1,
        negativeMarks: 0,
        partialMarks: true,
        isPublished: true,
        shareableLink: t.link,
        createdBy: admin.id,
      },
    })

    // Whitelist the shared student on WHITELIST tests.
    if (t.accessMode === 'WHITELIST') {
      await db.whitelist.create({
        data: { testId: test.id, identifier: studentPhone, identifierType: 'PHONE' },
      })
    }

    // Add 2 auto-gradeable MCQ questions to the PUBLIC quiz so the full
    // start → answer → submit → auto-grade → result flow is testable there.
    if (t.accessMode === 'PUBLIC') {
      await db.question.createMany({
        data: [
          {
            testId: test.id,
            questionText: 'What is 2 + 2?',
            type: 'MCQ',
            options: ['3', '4', '5', '22'],
            correctAnswers: [1],
            explanation: '2 + 2 = 4.',
            positiveMarks: 1,
            negativeMarks: 0,
            order: 0,
          },
          {
            testId: test.id,
            questionText: 'Capital of France?',
            type: 'MCQ',
            options: ['London', 'Berlin', 'Paris', 'Madrid'],
            correctAnswers: [2],
            explanation: 'Paris has been the capital of France since 987 AD.',
            positiveMarks: 1,
            negativeMarks: 0,
            order: 1,
          },
        ],
      })
    }
  }

  console.log('✅ Seed complete.')
  console.log('   Admin:        ', email, '/', password)
  console.log('   Tests:')
  console.log('     demo123  (WHITELIST, code GK4MP7)  — student', studentPhone)
  console.log('     demo456  (WHITELIST, code AP3K9X)  — student', studentPhone)
  console.log('     pubdemo  (PUBLIC, code PU8B2N)      — anyone, 2 MCQs for auto-grade')
  console.log('   Home page: enter GK4MP7 / AP3K9X / PU8B2N to open a test')
  console.log('   Direct links: /?t=demo123  /?t=demo456  /?t=pubdemo')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
