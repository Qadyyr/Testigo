'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Globe,
  KeyRound,
  ListChecks,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  Timer,
  Trophy,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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

// ---- API contract (mirror Task 1's /api/tests/{token}) ---------------------

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

interface ApiResponse<T> {
  success: boolean
  message?: string
  data?: T
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: ParticipantTest }

// ---- Helpers ---------------------------------------------------------------

function formatInTz(iso: string, tz: string | null): string {
  try {
    const d = new Date(iso)
    const formatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz || undefined,
    })
    return formatter.format(d)
  } catch {
    return iso
  }
}

function accessLabel(mode: ParticipantTest['accessMode']): string {
  switch (mode) {
    case 'PUBLIC':
      return 'Public — anyone with the link'
    case 'CODE':
      return 'Access code required'
    case 'WHITELIST':
      return 'Whitelist — invited participants only'
  }
}

function accessIcon(mode: ParticipantTest['accessMode']) {
  if (mode === 'PUBLIC') return Globe
  if (mode === 'CODE') return KeyRound
  return Lock
}

// ---- States ----------------------------------------------------------------

function TestSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
      <Skeleton className="h-12 w-full rounded-md" />
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

function TestDetails({ test }: { test: ParticipantTest }) {
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

  const startDisabled = test.scheduledClosed || !test.scheduledOpen
  const startLabel = test.scheduledClosed
    ? 'Test closed'
    : !test.scheduledOpen
      ? 'Not yet open'
      : 'Start Test'
  const StartIcon = startDisabled ? Lock : Play

  function handleStart() {
    toast.message('Test-taking flow arrives in Phase 4.')
  }

  const rules = [
    'Your progress auto-saves every 10 seconds.',
    'If you lose connection, refresh the page — your answers and timer are recovered from the server.',
    'Tab-switching is monitored. After 3 switches your test is auto-submitted.',
    'The timer is validated on the server, not just your browser.',
    'Results are released per the test setting (immediate or manual).',
  ]

  const AccessIcon: DetailIcon = accessIcon(test.accessMode)

  const details: Array<{
    icon: DetailIcon
    label: string
    value: React.ReactNode
  }> = [
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
      icon: AccessIcon,
      label: 'Access',
      value: accessLabel(test.accessMode),
    },
    {
      icon: Users,
      label: 'Max Attempts',
      value: test.maxAttempts > 0
        ? `${test.maxAttempts} per participant`
        : 'Unlimited',
    },
    {
      icon: Trophy,
      label: 'Results',
      value:
        test.resultReleaseMode === 'IMMEDIATE'
          ? 'Released immediately on submit'
          : 'Released manually by admin',
    },
  ]

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col gap-4"
    >
      {/* Header card */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              {test.accessMode === 'PUBLIC'
                ? 'Public'
                : test.accessMode === 'CODE'
                  ? 'Code'
                  : 'Whitelist'}
            </Badge>
            <Badge variant="outline" className="gap-1">
              {test.resultReleaseMode === 'IMMEDIATE' ? (
                <>
                  <Trophy className="size-3" />
                  Instant results
                </>
              ) : (
                <>
                  <Clock className="size-3" />
                  Manual results
                </>
              )}
            </Badge>
            {statusBadge}
          </div>
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

      {/* Details card */}
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

      {/* Rules card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4 text-emerald-600" />
            Rules
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

      {/* Start button */}
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          onClick={handleStart}
          disabled={startDisabled}
          className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
        >
          <StartIcon className="size-4" />
          {startLabel}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By starting, you agree to follow the test rules above.
        </p>
      </div>
    </motion.div>
  )
}

// ---- Main view -------------------------------------------------------------

export function ParticipantTestView() {
  const { params, navigate } = useViewRouter()
  const token = params.get('t') ?? ''
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (!token) {
      setLoadState({ status: 'not-found' })
      return
    }
    let cancelled = false
    setLoadState({ status: 'loading' })

    async function load() {
      try {
        const res = await fetch(
          `/api/tests/${encodeURIComponent(token)}`,
          { credentials: 'include' }
        )
        if (cancelled) return
        if (res.status === 404) {
          setLoadState({ status: 'not-found' })
          return
        }
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`)
        }
        const json: ApiResponse<ParticipantTest> = await res.json()
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
        {loadState.status === 'ok' && <TestDetails test={loadState.data} />}
      </main>

      <SiteFooter />
    </div>
  )
}
