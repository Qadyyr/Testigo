'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useTheme } from 'next-themes'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  FileSpreadsheet,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  useEffect(() => {
    // Hydration gate for next-themes (icon depends on resolved theme).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <Sun className="size-4" />
      </Button>
    )
  }
  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

/** Accepts either a raw token/code or a full test URL and extracts the `t` param. */
function extractToken(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    const t = url.searchParams.get('t')
    if (t) return t
  } catch {
    // not a URL — treat the raw value as the token
  }
  return trimmed
}

export function HomeView() {
  const { navigate } = useViewRouter()
  const reduceMotion = useReducedMotion()
  const [tokenInput, setTokenInput] = useState('')

  function handleOpenTest(e: FormEvent) {
    e.preventDefault()
    const token = extractToken(tokenInput)
    if (!token) return
    navigate(undefined, { t: token })
  }

  const features = [
    {
      icon: FileSpreadsheet,
      title: 'Bulk Import + Dry-Run Validation',
      body: 'Paste CSV, JSON, or Markdown. Validate every question against your schema with a dry-run before a single participant sees it.',
    },
    {
      icon: ShieldCheck,
      title: 'Anti-Cheat & Backend Timer',
      body: 'Server-validated timers, tab-switch monitoring with auto-submit, and network-recovery on refresh keep results trustworthy.',
    },
    {
      icon: BarChart3,
      title: 'Instant or Manual Results',
      body: 'Release scores immediately on submit or curate them manually. Export to CSV and email participants in bulk when ready.',
    },
  ]

  const fade = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay },
  })

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="OmniTest Engine — home"
          >
            <Brand />
          </button>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('login')}
              className="hidden sm:inline-flex"
            >
              Admin Login
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('login')}
              className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 sm:hidden"
            >
              Login
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <section className="flex flex-col items-start gap-6">
          <motion.span
            {...fade(0)}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Phase 1 · Foundation live
          </motion.span>

          <motion.h1
            {...fade(0.04)}
            className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Secure, scalable test-taking.
          </motion.h1>

          <motion.p
            {...fade(0.08)}
            className="max-w-2xl text-base text-muted-foreground text-pretty sm:text-lg"
          >
            Admin-driven. Effortless for participants. Built to scale from
            free-tier to production.
          </motion.p>

          <motion.div
            {...fade(0.12)}
            className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"
          >
            <Button
              size="lg"
              onClick={() => navigate('login')}
              className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
            >
              Admin Login
              <ArrowRight className="size-4" />
            </Button>

            <form
              onSubmit={handleOpenTest}
              className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
            >
              <Input
                type="text"
                inputMode="url"
                autoComplete="off"
                placeholder="Paste your test link or code"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="h-10 w-full sm:w-72"
                aria-label="Test link or code"
              />
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={!tokenInput.trim()}
                className="h-10"
              >
                Open Test
              </Button>
            </form>
          </motion.div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              {...fade(0.15 + i * 0.06)}
            >
              <Card className="h-full">
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    <feature.icon className="size-5" />
                  </span>
                  <CardTitle className="mt-2 text-base">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-pretty">
                    {feature.body}
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
