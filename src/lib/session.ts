import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Session } from 'next-auth'

/**
 * Server-side admin session accessor for API route handlers.
 * Usage:
 *   const session = await getAdminSession()
 *   if (!session || session.user.role !== 'ADMIN') return 401
 */
export async function getAdminSession(): Promise<Session | null> {
  return getServerSession(authOptions)
}
