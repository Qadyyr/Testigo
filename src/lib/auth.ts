import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

/**
 * NextAuth configuration for Testigo.
 *
 * Only admins have accounts. Participants take tests via shareable links and
 * (in Phase 4) OTP verification — they never go through this credentials flow.
 *
 * Strategy: JWT (stateless, works on SQLite + serverless without a session db).
 * The admin row is looked up in Prisma and the password verified with bcrypt.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  // The app is a single-route SPA; the canonical sign-in view is "/?view=login".
  pages: { signIn: '/' },
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim()
        const password = credentials?.password ?? ''
        if (!email || !password) return null

        const admin = await db.admin.findUnique({ where: { email } })
        if (!admin) return null

        const ok = await bcrypt.compare(password, admin.passwordHash)
        if (!ok) return null

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name ?? admin.email,
          role: admin.role as 'ADMIN' | 'SUPER_ADMIN',
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
