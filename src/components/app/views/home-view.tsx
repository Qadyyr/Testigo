'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useTheme } from 'next-themes'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowRight,
  Loader2,
  LogIn,
  Moon,
  Sun,
  TerminalSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

// ---- API contracts ---------------------------------------------------------

interface ResolveCodeResponse {
  shareableLink: string
  requireCode: boolean
}
interface ApiEnvelope<T> {
  success: boolean
  message?: string
  data?: T
}

// ---- helpers ---------------------------------------------------------------

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

/**
 * Accepts either a raw test code (e.g. "GK2024") or a full test URL
 * (e.g. "https://testigo.vercel.app/?t=abc123") and returns the token
 * to navigate to, plus whether it was a direct link.
 */
function parseInput(raw: string): { link?: string; code?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  // If it looks like a URL, try to extract the `t` param.
  if (trimmed.includes('://') || trimmed.startsWith('?t=')) {
    try {
      const url = new URL(trimmed.startsWith('?') ? `http://x${trimmed}` : trimmed)
      const t = url.searchParams.get('t')
      if (t) return { link: t }
    } catch {
      // not a valid URL — treat as a code
    }
  }
  return { code: trimmed }
}

// ---- terminal accent (decorative, tech feel) ------------------------------

function TerminalAccent() {
  const reduceMotion = useReducedMotion()
  const lines = [
    { p: '$', t: 'testigo open --code GK2024', c: 'text-foreground' },
    { p: '↳', t: 'test found', c: 'text-emerald-600 dark:text-emerald-400' },
    { p: '$', t: 'verifying access…', c: 'text-foreground' },
    { p: '↳', t: 'session started', c: 'text-emerald-600 dark:text-emerald-400' },
    { p: '$', t: 'testigo start', c: 'text-foreground' },
    { p: '↳', t: 'good luck', c: 'text-muted-foreground' },
  ]
  return (
    <Card className="overflow-hidden border-border/60 bg-muted/40 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2 border-b bg-background/60 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-red-400/70" />
          <span className="size-3 rounded-full bg-amber-400/70" />
          <span className="size-3 rounded-full bg-emerald-400/70" />
        </span>
        <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <TerminalSquare className="size-3.5" />
          testigo — session
        </span>
      </CardHeader>
      <CardContent className="p-4 font-mono text-xs leading-relaxed">
        <div className="flex flex-col gap-1.5">
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.18, duration: 0.3 }}
              className="flex items-start gap-2"
            >
              <span className="shrink-0 select-none text-muted-foreground/70">
                {line.p}
              </span>
              <span className={line.c}>{line.t}</span>
            </motion.div>
          ))}
          <motion.span
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ delay: 1.4, duration: 1, repeat: Infinity }}
            className="mt-0.5 inline-block h-3.5 w-2 bg-emerald-600 dark:bg-emerald-400"
            aria-hidden
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ---- main view -------------------------------------------------------------

export function HomeView() {
  const { navigate } = useViewRouter()
  const reduceMotion = useReducedMotion()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { link, code } = parseInput(input)
    if (!link && !code) {
      toast.error('Enter a test code or paste your test link.')
      return
    }

    // Direct link — go straight to the test.
    if (link) {
      navigate(undefined, { t: link })
      return
    }

    // Code — resolve via the API.
    setLoading(true)
    setNotFound(false)
    try {
      const res = await fetch('/api/tests/resolve-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json: ApiEnvelope<ResolveCodeResponse> = await res.json()
      if (!res.ok || !json.success || !json.data) {
        setNotFound(true)
        return
      }
      // Remember the code so the participant gate can skip re-entering it.
      try {
        sessionStorage.setItem('testigo:code', code!)
      } catch {
        /* non-fatal */
      }
      navigate(undefined, { t: json.data.shareableLink })
    } catch {
      toast.error('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const fade = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay },
  })

  return (
    <div className="flex flex-1 flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Testigo — home"
          >
            <Brand />
          </button>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('login')}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogIn className="size-4" />
              Admin
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
        {/* Left: copy + entry */}
        <section className="flex flex-col items-start gap-6">
          <motion.span
            {...fade(0)}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Secure test access
          </motion.span>

          <motion.h1
            {...fade(0.04)}
            className="text-4xl font-bold tracking-tight text-balance sm:text-5xl"
          >
            Tests, without the friction.
          </motion.h1>

          <motion.p
            {...fade(0.08)}
            className="max-w-md text-base text-muted-foreground text-pretty sm:text-lg"
          >
            Enter the code your administrator gave you, or paste your test link
            to get started.
          </motion.p>

          {/* Entry card */}
          <motion.div {...fade(0.12)} className="w-full max-w-md">
            <Card>
              <CardHeader className="gap-1.5">
                <CardTitle className="text-base">Open a test</CardTitle>
                <CardDescription>
                  {notFound
                    ? 'No test found for that code. Check it and try again.'
                    : 'Enter your test code (e.g. GK2024) or paste the test link.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="test-input" className="text-xs">
                      Test code or link
                    </Label>
                    <Input
                      id="test-input"
                      type="text"
                      autoComplete="off"
                      placeholder="GK2024  ·  or paste link"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value)
                        setNotFound(false)
                      }}
                      className="font-mono"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Opening…
                      </>
                    ) : (
                      <>
                        Open test
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* Right: terminal accent (desktop only) */}
        <motion.section
          {...fade(0.2)}
          className="hidden lg:block"
          aria-hidden
        >
          <TerminalAccent />
        </motion.section>
      </main>

      <SiteFooter />
    </div>
  )
}
