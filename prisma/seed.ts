/**
 * Seed script for OmniTest Engine (Phase 1, refined access model).
 * Run with:  bun prisma/seed.ts
 *
 * Access model: every test is WHITELIST-based. Admin registers students by
 * email/phone. A student enters their email/phone on the home page; if they
 * are registered for exactly one (open) test they proceed directly, otherwise
 * they enter a per-test code to choose.
 *
 * Creates:
 *   - SUPER_ADMIN: admin@omnitest.test / admin1234
 *   - Test A: "Sample General Knowledge Quiz"  link=demo123  code=GK2024
 *   - Test B: "Sample Aptitude Assessment"     link=demo456  code=APT2024
 *   - Whitelist: student@omnitest.test / +923001234567 on BOTH tests
 *     (so the multi-test → code path is demonstrable)
 */
import bcrypt from 'bcryptjs'
import { db } from '../src/lib/db'

async function main() {
  const email = 'admin@omnitest.test'
  const password = 'admin1234'
  const passwordHash = await bcrypt.hash(password, 10)

  const admin = await db.admin.upsert({
    where: { email },
    update: { passwordHash, role: 'SUPER_ADMIN' },
    create: {
      email,
      passwordHash,
      name: 'OmniTest Admin',
      role: 'SUPER_ADMIN',
    },
  })

  // Shared participant identity, registered on both tests.
  const studentEmail = 'student@omnitest.test'
  const studentPhone = '+923001234567'

  const tests = [
    {
      link: 'demo123',
      code: 'GK2024',
      title: 'Sample General Knowledge Quiz',
      description:
        'A short demonstration quiz. Real questions arrive with the Phase 2 import wizard.',
      timeLimitMinutes: 15,
    },
    {
      link: 'demo456',
      code: 'APT2024',
      title: 'Sample Aptitude Assessment',
      description:
        'A second demonstration test sharing the same participant, so the multi-test code flow can be tried.',
      timeLimitMinutes: 20,
    },
  ]

  for (const t of tests) {
    const test = await db.test.upsert({
      where: { shareableLink: t.link },
      update: {
        title: t.title,
        description: t.description,
        timeLimitMinutes: t.timeLimitMinutes,
        accessMode: 'WHITELIST',
        isPublic: false,
        accessCode: t.code,
        maxAttempts: 1,
        resultReleaseMode: 'IMMEDIATE',
        positiveMarks: 1,
        negativeMarks: 0,
        isPublished: true,
        createdBy: admin.id,
      },
      create: {
        title: t.title,
        description: t.description,
        timeLimitMinutes: t.timeLimitMinutes,
        accessMode: 'WHITELIST',
        isPublic: false,
        accessCode: t.code,
        maxAttempts: 1,
        resultReleaseMode: 'IMMEDIATE',
        positiveMarks: 1,
        negativeMarks: 0,
        isPublished: true,
        shareableLink: t.link,
        createdBy: admin.id,
      },
    })

    // Whitelist the shared student on this test (compound unique: testId+email).
    await db.whitelist.upsert({
      where: {
        testId_email: { testId: test.id, email: studentEmail },
      },
      update: { phone: studentPhone },
      create: {
        testId: test.id,
        email: studentEmail,
        phone: studentPhone,
      },
    })
  }

  console.log('✅ Seed complete.')
  console.log('   Admin:        ', email, '/', password)
  console.log('   Student:      ', studentEmail, '/', studentPhone)
  console.log('   Tests:        demo123 (code GK2024), demo456 (code APT2024)')
  console.log('   Single-test demo:  enter student email → proceeds to one?')
  console.log('                       (here: 2 tests → code step)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
