'use client'

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { AppShell } from '@/components/app/app-shell'

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96 max-w-full" />
            <div className="mt-4 max-w-md">
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        </div>
      }
    >
      <AppShell />
    </Suspense>
  )
}
