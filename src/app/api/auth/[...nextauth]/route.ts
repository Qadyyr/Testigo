import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

// Credentials authorize uses bcrypt + Prisma (Node-only). Force node runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
