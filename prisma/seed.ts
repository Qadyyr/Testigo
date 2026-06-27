/**
 * Seed script for OmniTest Engine (Phase 1).
 * Run with:  bun prisma/seed.ts
 *
 * Creates:
 *   - a default SUPER_ADMIN (admin@omnitest.test / admin1234)
 *   - one sample published PUBLIC test with shareable link token "demo123"
 *     so the admin dashboard and participant landing are both demonstrable.
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

  const link = 'demo123'
  await db.test.upsert({
    where: { shareableLink: link },
    update: {},
    create: {
      title: 'Sample General Knowledge Quiz',
      description:
        'A short demonstration test. Real questions arrive with the Phase 2 import wizard.',
      timeLimitMinutes: 15,
      accessMode: 'PUBLIC',
      isPublic: true,
      maxAttempts: 1,
      resultReleaseMode: 'IMMEDIATE',
      positiveMarks: 1,
      negativeMarks: 0,
      isPublished: true,
      shareableLink: link,
      createdBy: admin.id,
    },
  })

  console.log('✅ Seed complete.')
  console.log('   Admin email:        ', email)
  console.log('   Admin password:     ', password)
  console.log('   Sample test token:  ', link)
  console.log('   Participant URL:    /?t=' + link)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
