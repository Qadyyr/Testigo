'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

/**
 * Client-side providers shared across the whole app:
 *  - NextAuth SessionProvider (admin auth state)
 *  - next-themes ThemeProvider (light/dark via class strategy)
 * Mounted once in src/app/layout.tsx so every view (and every API route via
 * cookies) can read the admin session with `useSession` / `getServerSession`.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </SessionProvider>
  )
}
