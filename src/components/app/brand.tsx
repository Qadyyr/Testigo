'use client'

import { ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * OmniTest Engine brand mark — a lucide icon in an emerald rounded square,
 * paired with the wordmark. Presentational only; wrap in a button/link when
 * the mark needs to be clickable.
 */
export function Brand({
  className,
  showWordmark = true,
}: {
  className?: string
  showWordmark?: boolean
}) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
        <ClipboardCheck className="size-5" />
      </span>
      {showWordmark && (
        <span className="text-base font-semibold tracking-tight">
          OmniTest <span className="text-emerald-600">Engine</span>
        </span>
      )}
    </span>
  )
}
