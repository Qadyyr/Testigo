'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export type ViewName = 'home' | 'login' | 'admin' | 'create' | 'test'

export interface ViewRouter {
  view: ViewName
  params: URLSearchParams
  navigate: (view?: string, extra?: Record<string, string>) => void
}

/**
 * SPA router for the single "/" route. Navigation is encoded entirely in URL
 * search params:
 *   - `?t=<token>` takes PRECEDENCE over `view` and routes to the participant test view.
 *   - `?view=home|login|admin` selects the named view.
 *   - No params (or anything unknown) resolves to the home view.
 */
export function useViewRouter(): ViewRouter {
  const router = useRouter()
  const searchParams = useSearchParams()

  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  )

  const token = params.get('t')
  const rawView = params.get('view') ?? 'home'
  const view: ViewName = token
    ? 'test'
    : rawView === 'login' ||
        rawView === 'admin' ||
        rawView === 'create'
      ? (rawView as 'login' | 'admin' | 'create')
      : 'home'

  const navigate = useCallback(
    (nextView?: string, extra?: Record<string, string>) => {
      const next = new URLSearchParams()
      const viewToSet =
        nextView ??
        (params.has('view') ? (params.get('view') as string) : undefined)
      if (viewToSet) next.set('view', viewToSet)
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          if (value === undefined || value === null) continue
          next.set(key, value)
        }
      }
      router.push('/?' + next.toString())
    },
    [router, params]
  )

  return { view, params, navigate }
}
