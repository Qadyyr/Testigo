import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/session'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Neon free tier: 0.5 GB = 536,870,912 bytes
const NEON_FREE_TIER_BYTES = 512 * 1024 * 1024

/**
 * GET /api/admin/database-usage
 * Super Admin only — real-time database storage usage from PostgreSQL.
 *
 * 200: { success, data: { usedBytes, limitBytes, percentage, usedMB, limitMB } }
 * 401/403: unauthorized
 */
export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return fail('Super admin access required', 403)
    }

    // Query PostgreSQL for the current database size.
    const result = await db.$queryRaw<[{ db_size: bigint }]>`
      SELECT pg_database_size(current_database()) as db_size
    `
    const usedBytes = Number(result[0]?.db_size ?? 0)
    const limitBytes = NEON_FREE_TIER_BYTES
    const percentage = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0

    return NextResponse.json({
      success: true,
      message: 'ok',
      data: {
        usedBytes,
        limitBytes,
        percentage: Math.round(percentage * 100) / 100,
        usedMB: Math.round((usedBytes / (1024 * 1024)) * 100) / 100,
        limitMB: Math.round((limitBytes / (1024 * 1024)) * 100) / 100,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/database-usage]', err)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
