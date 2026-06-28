'use client'

import { Brand } from './brand'

/**
 * Sticky footer used on every view. Relies on `mt-auto` inside a parent
 * `flex flex-col` (the view root) so it sticks to the viewport bottom on
 * short content and is pushed down naturally on long content.
 */
export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-4 py-6 sm:flex-row sm:items-center sm:px-6">
        <div className="flex flex-col gap-1.5">
          <Brand />
          <p className="text-xs text-muted-foreground">
            Create and run secure online tests. No student accounts needed.
          </p>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:text-right">
          <span>© {year} Testigo</span>
          <span>Built for educators</span>
        </div>
      </div>
    </footer>
  )
}
