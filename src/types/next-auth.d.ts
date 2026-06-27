import 'next-auth'
import 'next-auth/jwt'

/**
 * NextAuth type augmentation — attach the admin's id + role to the session/JWT
 * so the frontend (`useSession`) and API routes (`getServerSession`) can read
 * `session.user.role` in a type-safe way.
 */
declare module 'next-auth' {
  interface User {
    id: string
    email: string
    name?: string | null
    role: 'ADMIN' | 'SUPER_ADMIN'
  }

  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: 'ADMIN' | 'SUPER_ADMIN'
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'ADMIN' | 'SUPER_ADMIN'
  }
}
