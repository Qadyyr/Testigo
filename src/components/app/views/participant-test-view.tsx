'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  Timer,
  Users,
  XCircle,
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

// ---- API contract (mirror /api/tests/{link} + /verify) ---------------------

interface ParticipantTest {
  id: string
  title: string
  description: string | null
  startTime: string | null
  endTime: string | null
  timezone: string | null
  timeLimitMinutes: number | null
  accessMode: 'PUBLIC' | 'CODE' | 'WHITELIST'
  isPublic: boolean
  maxAttempts: number
  resultReleaseMode: 'IMMEDIATE' | 'MANUAL'
  isPublished: boolean
  scheduledOpen: boolean
  scheduledClosed: boolean
}
interface VerifyResponse {
  allowed: boolean
}
interface ApiEnvelope<T> {
  success: boolean
  message?: string
  data?: T
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: ParticipantTest }

// Participant-facing access flow states.
type AccessStep =
  | { name: 'idle' }
  | { name: 'verifying' }
  | { name: 'allowed' }
  | { name: 'denied' }

// ---- helpers ---------------------------------------------------------------

function formatInTz(iso: string, tz: string | null): string {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz || undefined,
    }).format(d)
  } catch {
    return iso
  }
}

// ---- states ----------------------------------------------------------------

function TestSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-3">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function NotFoundState({ onHome }: { onHome: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlert className="size-6" />
        </span>
        <CardTitle>Test not found</CardTitle>
        <CardDescription>
          This test link is invalid, expired, or has been removed by the
          administrator.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button variant="outline" size="sm" onClick={onHome}>
          <ArrowLeft className="size-4" />
          Back to home
        </Button>
      </CardContent>
    </Card>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <RefreshCw className="size-6" />
        </span>
        <CardTitle>Couldn&apos;t load the test</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  )
}

type DetailIcon = React.ComponentType<{ className?: string }>

function TestDetails({
  test,
  accessStep,
  phone,
  setPhone,
  onVerify,
  onStart,
}: {
  test: ParticipantTest
  accessStep: AccessStep
  phone: string
  setPhone: (v: string) => void
  onVerify: (e: FormEvent) => void
  onStart: () => void
}) {
  const reduceMotion = useReducedMotion()

  const scheduleText =
    test.startTime && test.endTime
      ? `${formatInTz(test.startTime, test.timezone)} → ${formatInTz(test.endTime, test.timezone)}`
      : test.startTime
        ? `From ${formatInTz(test.startTime, test.timezone)}`
        : test.endTime
          ? `Until ${formatInTz(test.endTime, test.timezone)}`
          : 'Anytime'
  const tzLabel = test.timezone ? `(${test.timezone})` : ''

  const statusBadge = test.scheduledClosed ? (
    <Badge variant="destructive">Closed</Badge>
  ) : !test.scheduledOpen ? (
    <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
      Not yet open
    </Badge>
  ) : (
    <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
      Open
    </Badge>
  )

  const scheduleBlocksStart = test.scheduledOpen && !test.scheduledClosed

  // Benign, participant-facing rules only. No anti-cheat internals, no
  // result-release mechanics — those are not the participant's concern.
  const rules = [
    'Ensure you have a stable internet connection before starting.',
    'Once started, complete the test within the time limit shown.',
    `You can attempt this test ${test.maxAttempts > 0 ? `${test.maxAttempts} time${test.maxAttempts > 1 ? 's' : ''}` : 'multiple times'}.`,
  ]

  const details: Array<{ icon: DetailIcon; label: string; value: React.ReactNode }> = [
    {
      icon: CalendarClock,
      label: 'Schedule',
      value: (
        <span>
          {scheduleText}{' '}
          {tzLabel && (
            <span className="text-muted-foreground">{tzLabel}</span>
          )}
        </span>
      ),
    },
    {
      icon: Timer,
      label: 'Time Limit',
      value: test.timeLimitMinutes
        ? `${test.timeLimitMinutes} minutes`
        : 'No limit',
    },
    {
      icon: Users,
      label: 'Max Attempts',
      value:
        test.maxAttempts > 0
          ? `${test.maxAttempts} per participant`
          : 'Unlimited',
    },
  ]

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">{statusBadge}</div>
          <CardTitle className="text-balance text-2xl sm:text-3xl">
            {test.title}
          </CardTitle>
          {test.description && (
            <CardDescription className="text-pretty text-sm sm:text-base">
              {test.description}
            </CardDescription>
          )}
        </CardHeader>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          {details.map((detail, i) => (
            <div key={detail.label}>
              {i > 0 && <Separator />}
              <div className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <detail.icon className="size-4" />
                </span>
                <div className="flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm font-medium">{detail.label}</span>
                  <span className="text-sm text-muted-foreground sm:text-right">
                    {detail.value}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rules (benign, participant-facing only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-emerald-600" />
            Before you start
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {rules.map((rule, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="text-foreground/90">{rule}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Access verification (whitelist gate; OTP lands in Phase 4) */}
      <Card>
        <CardHeader className="gap-1.5">
          <CardTitle className="text-base">Verify your access</CardTitle>
          <CardDescription>
            Enter the phone number your administrator registered for this test.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {accessStep.name !== 'allowed' && (
            <form onSubmit={onVerify} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="identity" className="text-xs">
                  Phone number
                </Label>
                <Input
                  id="identity"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+92 300 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={accessStep.name === 'verifying'}
                />
              </div>
              <Button
                type="submit"
                disabled={accessStep.name === 'verifying'}
                className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
              >
                {accessStep.name === 'verifying' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Verify access
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {accessStep.name === 'denied' && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex flex-col gap-1">
                <span className="font-medium text-destructive">
                  Not registered for this test
                </span>
                <span className="text-muted-foreground">
                  This phone number isn&apos;t on the test&apos;s access list.
                  Contact your administrator if this seems wrong.
                </span>
              </div>
            </div>
          )}

          {accessStep.name === 'allowed' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    Access verified
                  </span>
                  <span className="text-muted-foreground">
                    You&apos;re cleared to start. Good luck!
                  </span>
                </div>
              </div>
              <Button
                size="lg"
                onClick={onStart}
                disabled={!scheduleBlocksStart}
                className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
              >
                <Play className="size-4" />
                {test.scheduledClosed
                  ? 'Test closed'
                  : !test.scheduledOpen
                    ? 'Not yet open'
                    : 'Start Test'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ---- main view -------------------------------------------------------------

export function ParticipantTestView() {
  const { params, navigate } = useViewRouter()
  const token = params.get('t') ?? ''
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  // Access-flow state.
  const [phone, setPhone] = useState('')
  const [accessStep, setAccessStep] = useState<AccessStep>({ name: 'idle' })

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  // Prefill phone from the home lookup (ephemeral, per-tab) if present.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('omnitest:phone')
      if (saved) setPhone(saved)
    } catch {
      /* non-fatal */
    }
  }, [])

  // Load the test by token.
  useEffect(() => {
    if (!token) {
      setLoadState({ status: 'not-found' })
      return
    }
    let cancelled = false
    setLoadState({ status: 'loading' })

    async function load() {
      try {
        const res = await fetch(`/api/tests/${encodeURIComponent(token)}`, {
          credentials: 'include',
        })
        if (cancelled) return
        if (res.status === 404) {
          setLoadState({ status: 'not-found' })
          return
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json: ApiEnvelope<ParticipantTest> = await res.json()
        if (cancelled) return
        if (json.success && json.data) {
          setLoadState({ status: 'ok', data: json.data })
        } else {
          throw new Error(json.message || 'Failed to load test')
        }
      } catch (e) {
        if (!cancelled) {
          setLoadState({
            status: 'error',
            message: e instanceof Error ? e.message : 'Network error',
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token, retryKey])

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    const p = phone.trim()
    if (!p) {
      toast.error('Enter your registered phone number.')
      return
    }
    setAccessStep({ name: 'verifying' })
    try {
      const res = await fetch(
        `/api/tests/${encodeURIComponent(token)}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: p }),
        }
      )
      const json: ApiEnvelope<VerifyResponse> = await res.json()
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Verification failed')
      }
      setAccessStep({ name: json.data.allowed ? 'allowed' : 'denied' })
    } catch {
      toast.error('Could not verify access. Try again.')
      setAccessStep({ name: 'idle' })
    }
  }

  function handleStart() {
    // OTP verification + attempt creation arrive in Phase 4.
    toast.message('Test-taking flow arrives in Phase 4.')
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="OmniTest Engine — home"
          >
            <Brand />
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('home')}
            className="text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {loadState.status === 'loading' && <TestSkeleton />}
        {loadState.status === 'not-found' && (
          <NotFoundState onHome={() => navigateRef.current('home')} />
        )}
        {loadState.status === 'error' && (
          <ErrorState
            message={loadState.message}
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        )}
        {loadState.status === 'ok' && (
          <TestDetails
            test={loadState.data}
            accessStep={accessStep}
            phone={phone}
            setPhone={setPhone}
            onVerify={handleVerify}
            onStart={handleStart}
          />
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
