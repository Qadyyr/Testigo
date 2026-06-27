'use client'

import { Suspense } from 'react'
import { AppShell } from '@/components/app/app-shell'

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      }
    >
      <AppShell />
    </Suspense>
  )
}
