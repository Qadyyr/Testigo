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

interface LookupTest {
  id: string
  title: string
  shareableLink: string
}
interface LookupResponse {
  count: number
  tests: LookupTest[]
}
interface ResolveResponse {
  shareableLink: string
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

/** Treat the value as an email if it contains '@', otherwise as a phone. */
function splitIdentity(raw: string): { email?: string; phone?: string } {
  const v = raw.trim()
  if (!v) return {}
  return v.includes('@') ? { email: v } : { phone: v }
}

// ---- terminal accent (decorative, tech feel) ------------------------------

function TerminalAccent() {
  const reduceMotion = useReducedMotion()
  const lines = [
    { p: '$', t: 'omnitest identify', c: 'text-foreground' },
    { p: '↳', t: 'email or phone registered ✓', c: 'text-emerald-600 dark:text-emerald-400' },
    { p: '$', t: 'omnitest tests', c: 'text-foreground' },
    { p: '↳', t: '2 tests found for you', c: 'text-muted-foreground' },
    { p: '$', t: 'omnitest start --code GK2024', c: 'text-foreground' },
    { p: '↳', t: 'opening secure session…', c: 'text-emerald-600 dark:text-emerald-400' },
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
          omnitest — session
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

type Step =
  | { name: 'entry' }
  | { name: 'looking' }
  | { name: 'multiple'; tests: LookupTest[] }
  | { name: 'none' }
  | { name: 'error'; message: string }

export function HomeView() {
  const { navigate } = useViewRouter()
  const reduceMotion = useReducedMotion()

  const [identity, setIdentity] = useState('')
  const [step, setStep] = useState<Step>({ name: 'entry' })
  const [code, setCode] = useState('')
  const [resolving, setResolving] = useState(false)

  async function handleLookup(e: FormEvent) {
    e.preventDefault()
    const payload = splitIdentity(identity)
    if (!payload.email && !payload.phone) {
      toast.error('Enter your registered email or phone.')
      return
    }
    setStep({ name: 'looking' })
    try {
      const res = await fetch('/api/tests/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json: ApiEnvelope<LookupResponse> = await res.json()
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Lookup failed')
      }
      const { count, tests } = json.data
      // Remember identity for the landing page to prefill (ephemeral, per-tab).
      try {
        sessionStorage.setItem('omnitest:identity', identity.trim())
      } catch {
        /* sessionStorage may be unavailable; non-fatal */
      }
      if (count === 1) {
        navigate(undefined, { t: tests[0].shareableLink })
      } else if (count === 0) {
        setStep({ name: 'none' })
      } else {
        setStep({ name: 'multiple', tests })
      }
    } catch (err) {
      setStep({
        name: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      })
    }
  }

  async function handleResolve(e: FormEvent) {
    e.preventDefault()
    const payload = splitIdentity(identity)
    if (!payload.email && !payload.phone) {
      toast.error('Enter your registered email or phone.')
      return
    }
    if (!code.trim()) {
      toast.error('Enter the test code your administrator gave you.')
      return
    }
    setResolving(true)
    try {
      const res = await fetch('/api/tests/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, code: code.trim() }),
      })
      const json: ApiEnvelope<ResolveResponse> = await res.json()
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Invalid code')
      }
      navigate(undefined, { t: json.data.shareableLink })
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === 'Invalid code'
          ? 'That code does not match any of your tests.'
          : 'Could not verify the code. Try again.'
      )
    } finally {
      setResolving(false)
    }
  }

  function reset() {
    setStep({ name: 'entry' })
    setCode('')
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
            onClick={() => {
              reset()
              navigate('home')
            }}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="OmniTest Engine — home"
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
            Enter the email or phone your administrator registered. We&apos;ll
            open the tests assigned to you — nothing else.
          </motion.p>

          {/* Entry / multi / not-found card */}
          <motion.div {...fade(0.12)} className="w-full max-w-md">
            {step.name === 'entry' && (
              <Card>
                <CardHeader className="gap-1.5">
                  <CardTitle className="text-base">Access your tests</CardTitle>
                  <CardDescription>
                    Use the email or phone your admin added to the test.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLookup} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="identity" className="text-xs">
                        Email or phone
                      </Label>
                      <Input
                        id="identity"
                        type="text"
                        autoComplete="username"
                        placeholder="you@example.com  ·  +92 300 1234567"
                        value={identity}
                        onChange={(e) => setIdentity(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                    >
                      Continue
                      <ArrowRight className="size-4" />
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {step.name === 'looking' && (
              <Card>
                <CardContent className="flex items-center gap-3 py-6">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Looking up your tests…
                  </span>
                </CardContent>
              </Card>
            )}

            {step.name === 'multiple' && (
              <Card>
                <CardHeader className="gap-1.5">
                  <CardTitle className="text-base">
                    {step.tests.length} tests found for you
                  </CardTitle>
                  <CardDescription>
                    Enter the code for the test you want to open.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-3">
                    {step.tests.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {t.title}
                      </li>
                    ))}
                  </ul>
                  <form
                    onSubmit={handleResolve}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="code" className="text-xs">
                        Test code
                      </Label>
                      <Input
                        id="code"
                        type="text"
                        autoComplete="off"
                        placeholder="e.g. GK2024"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="font-mono uppercase"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={resolving}
                      className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                    >
                      {resolving ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Verifying…
                        </>
                      ) : (
                        <>
                          Open test
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  </form>
                  <button
                    type="button"
                    onClick={reset}
                    className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Use a different email or phone
                  </button>
                </CardContent>
              </Card>
            )}

            {step.name === 'none' && (
              <Card>
                <CardHeader className="gap-1.5">
                  <CardTitle className="text-base">No tests found</CardTitle>
                  <CardDescription>
                    We couldn&apos;t find any tests registered for{' '}
                    <span className="font-medium text-foreground">
                      {identity}
                    </span>
                    . Contact your administrator if this seems wrong.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={reset}
                  >
                    Try again
                  </Button>
                </CardContent>
              </Card>
            )}

            {step.name === 'error' && (
              <Card>
                <CardHeader className="gap-1.5">
                  <CardTitle className="text-base">
                    Something went wrong
                  </CardTitle>
                  <CardDescription>{step.message}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={reset}
                  >
                    Try again
                  </Button>
                </CardContent>
              </Card>
            )}
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
