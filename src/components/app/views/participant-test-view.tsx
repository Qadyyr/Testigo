'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { motion, useReducedMotion } from 'framer-motion'
import { create } from 'zustand'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Grid,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Timer,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

// ---- API contracts ---------------------------------------------------------

interface ParticipantTest {
  id: string
  title: string
  description: string | null
  startTime: string | null
  endTime: string | null
  timezone: string | null
  timeLimitMinutes: number | null
  accessMode: 'PUBLIC' | 'WHITELIST' | 'INVITE'
  requireCode: boolean
  isPublic: boolean
  maxAttempts: number
  resultReleaseMode: 'IMMEDIATE' | 'MANUAL' | 'NEVER'
  isPublished: boolean
  scheduledOpen: boolean
  scheduledClosed: boolean
}
interface StartResponse {
  token: string
  attemptId: string
  expiresAt: string
  resumed: boolean
}
interface LoadQuestion {
  id: string
  questionText: string
  type: 'MCQ' | 'TRUE_FALSE' | 'SHORT'
  options: string[]
  positiveMarks: number
  negativeMarks: number
  order: number
}
interface LoadResponse {
  test: {
    id: string
    title: string
    description: string | null
    timeLimitMinutes: number | null
    timezone: string | null
    positiveMarks: number
    negativeMarks: number
    partialMarks: boolean
  }
  questions: LoadQuestion[]
  answers: Record<string, number[] | string>
  attempt: { startTime: string; status: string; tabSwitches: number }
}
interface GradedAnswer {
  questionId: string
  questionText: string
  type: string
  options: string[]
  userAnswer: number[] | string | null
  correctAnswers: number[] | string[]
  isCorrect: boolean | null
  marksAwarded: number | null
  positiveMarks: number
  negativeMarks: number
  explanation: string | null
}
interface ResultData {
  score: number
  total: number
  correct: number | null
  pending: number
  resultMode: 'IMMEDIATE' | 'MANUAL' | 'NEVER'
  showResults: boolean
  autoSubmitted: boolean
  alreadySubmitted?: boolean
  answers?: GradedAnswer[]
}
interface ApiEnvelope<T> {
  success: boolean
  message?: string
  code?: string
  data?: T
}

type Phase = 'loading' | 'not-found' | 'error' | 'landing' | 'gating' | 'taking' | 'result'

// ---- zustand store for the test-taking state -------------------------------

interface TestStore {
  answers: Record<string, number[] | string>
  current: number
  flagged: Record<string, boolean>
  setAnswer: (qId: string, ans: number[] | string) => void
  setCurrent: (i: number) => void
  toggleFlag: (qId: string) => void
  hydrate: (answers: Record<string, number[] | string>) => void
}

const useTestStore = create<TestStore>((set) => ({
  answers: {},
  current: 0,
  flagged: {},
  setAnswer: (qId, ans) =>
    set((s) => ({ answers: { ...s.answers, [qId]: ans } })),
  setCurrent: (i) => set({ current: i }),
  toggleFlag: (qId) =>
    set((s) => ({ flagged: { ...s.flagged, [qId]: !s.flagged[qId] } })),
  hydrate: (answers) => set({ answers }),
}))

// ---- helpers ---------------------------------------------------------------

function formatInTz(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz || undefined,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// ---- main view -------------------------------------------------------------

export function ParticipantTestView() {
  const { params, navigate } = useViewRouter()
  const token = params.get('t') ?? ''
  const inviteToken = params.get('invite') ?? ''
  const [phase, setPhase] = useState<Phase>('loading')
  const [test, setTest] = useState<ParticipantTest | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [result, setResult] = useState<ResultData | null>(null)

  // Session token (ref to avoid re-render churn; mirrored to sessionStorage).
  const sessionRef = useRef<string | null>(null)

  // Load test details.
  useEffect(() => {
    if (!token) {
      setPhase('not-found')
      return
    }
    let cancelled = false
    setPhase('loading')
    async function load() {
      try {
        const res = await fetch(`/api/tests/${encodeURIComponent(token)}`)
        if (cancelled) return
        if (res.status === 404) {
          setPhase('not-found')
          return
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json: ApiEnvelope<ParticipantTest> = await res.json()
        if (cancelled) return
        if (json.success && json.data) {
          setTest(json.data)
          // Resume an in-progress attempt if a session token is stored.
          const stored = sessionStorage.getItem('testigo:session')
          if (stored) {
            sessionRef.current = stored
            setPhase('taking')
          } else {
            setPhase('landing')
          }
        } else {
          throw new Error(json.message || 'Failed to load test')
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Network error')
          setPhase('error')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token, retryKey])

  const handleStartResult = useCallback((data: ResultData | null) => {
    setResult(data)
    setPhase('result')
  }, [])

  return (
    <div className="flex flex-1 flex-col">
      <Header onHome={() => navigate('home')} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {phase === 'loading' && <TestSkeleton />}
        {phase === 'not-found' && (
          <NotFoundState onHome={() => navigate('home')} />
        )}
        {phase === 'error' && (
          <ErrorState
            message={loadError ?? 'Unknown error'}
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        )}
        {phase === 'landing' && test && (
          <Landing test={test} onStart={() => setPhase('gating')} />
        )}
        {phase === 'gating' && test && (
          <Gating
            test={test}
            inviteToken={inviteToken}
            sessionRef={sessionRef}
            onStarted={() => setPhase('taking')}
            onBack={() => setPhase('landing')}
            onAlreadyAttempted={handleStartResult}
            sessionToken={token}
          />
        )}
        {phase === 'taking' && test && (
          <Taking
            test={test}
            sessionRef={sessionRef}
            sessionToken={token}
            onSubmitted={handleStartResult}
            onSessionLost={() => {
              sessionStorage.removeItem('testigo:session')
              sessionRef.current = null
              setPhase('landing')
            }}
          />
        )}
        {phase === 'result' && (
          <Result result={result} onHome={() => navigate('home')} />
        )}
      </main>
      {phase !== 'taking' && <SiteFooter />}
    </div>
  )
}

// ---- shared header ---------------------------------------------------------

function Header({ onHome }: { onHome: () => void }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Testigo — home"
        >
          <Brand />
        </button>
        <Button variant="ghost" size="sm" onClick={onHome} className="text-muted-foreground">
          <ArrowLeft className="size-4" />
          Back to home
        </Button>
      </div>
    </header>
  )
}

// ---- loading / error / not-found ------------------------------------------

function TestSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-3">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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

// ---- phase: landing --------------------------------------------------------

function Landing({ test, onStart }: { test: ParticipantTest; onStart: () => void }) {
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

  const canStart = test.isPublished && test.scheduledOpen && !test.scheduledClosed
  const startLabel = !test.isPublished
    ? 'Not published'
    : test.scheduledClosed
      ? 'Test closed'
      : !test.scheduledOpen
        ? 'Not yet open'
        : 'Start Test'

  const rules = [
    'Ensure you have a stable internet connection before starting.',
    'Once started, complete the test within the time limit shown.',
    `You can attempt this test ${test.maxAttempts > 0 ? `${test.maxAttempts} time${test.maxAttempts > 1 ? 's' : ''}` : 'multiple times'}.`,
    test.requireCode ? 'An access code is required to start.' : 'No access code needed.',
  ]

  const details = [
    { icon: CalendarClock, label: 'Schedule', value: `${scheduleText} ${tzLabel}` },
    { icon: Timer, label: 'Time Limit', value: test.timeLimitMinutes ? `${test.timeLimitMinutes} minutes` : 'No limit' },
    { icon: Users, label: 'Max Attempts', value: test.maxAttempts > 0 ? `${test.maxAttempts} per participant` : 'Unlimited' },
  ]

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex w-full max-w-3xl flex-col gap-4"
    >
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">{statusBadge}</div>
          <CardTitle className="text-balance text-2xl sm:text-3xl">{test.title}</CardTitle>
          {test.description && (
            <CardDescription className="text-pretty text-sm sm:text-base">
              {test.description}
            </CardDescription>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Test details</CardTitle></CardHeader>
        <CardContent className="flex flex-col">
          {details.map((d, i) => (
            <div key={d.label}>
              {i > 0 && <Separator />}
              <div className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <d.icon className="size-4" />
                </span>
                <div className="flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm font-medium">{d.label}</span>
                  <span className="text-sm text-muted-foreground sm:text-right">{d.value}</span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="text-foreground/90">{rule}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Button
        size="lg"
        onClick={onStart}
        disabled={!canStart}
        className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
      >
        <Play className="size-4" />
        {startLabel}
      </Button>
    </motion.div>
  )
}

// ---- phase: gating ---------------------------------------------------------

function Gating({
  test,
  inviteToken,
  sessionRef,
  onStarted,
  onBack,
  onAlreadyAttempted,
  sessionToken,
}: {
  test: ParticipantTest
  inviteToken: string
  sessionRef: React.MutableRefObject<string | null>
  onStarted: () => void
  onBack: () => void
  onAlreadyAttempted: (data: ResultData | null) => void
  sessionToken: string
}) {
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState(() => {
    try {
      return sessionStorage.getItem('testigo:code') ?? ''
    } catch {
      return ''
    }
  })
  const [invite, setInvite] = useState(inviteToken)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  async function handleStart(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Enter your name to continue.')
      return
    }
    const body: Record<string, string> = { name: name.trim() }
    if (test.accessMode === 'WHITELIST') {
      if (!identifier.trim()) {
        setError('Enter your registered phone number.')
        return
      }
      body.identifier = identifier.trim()
    } else if (test.accessMode === 'INVITE') {
      if (!invite.trim()) {
        setError('Enter your invitation code.')
        return
      }
      body.inviteToken = invite.trim()
      body.identifier = invite.trim()
    }
    if (test.requireCode) {
      if (!code.trim()) {
        setError('Enter the access code.')
        return
      }
      body.accessCode = code.trim()
    }

    setStarting(true)
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(sessionToken)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json: ApiEnvelope<StartResponse> & { code?: string; startsAt?: string } = await res.json()
      if (!res.ok || !json.success || !json.data) {
        const c = json.code
        if (c === 'ALREADY_ATTEMPTED' || c === 'TIME_UP') {
          if (c === 'TIME_UP') toast.info('Your time was up; the test was auto-submitted.')
          onAlreadyAttempted(null)
          return
        }
        if (c === 'NOT_STARTED' || c === 'CLOSED') {
          toast.error(json.message ?? 'Test is not available.')
          onBack()
          return
        }
        setError(json.message ?? 'Could not start the test.')
        return
      }
      sessionRef.current = json.data.token
      try {
        sessionStorage.setItem('testigo:session', json.data.token)
        sessionStorage.setItem('testigo:attemptId', json.data.attemptId)
      } catch {
        /* non-fatal */
      }
      if (json.data.resumed) toast.info('Resuming your in-progress attempt.')
      onStarted()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader className="gap-1.5">
          <CardTitle className="text-base">Verify your access</CardTitle>
          <CardDescription>
            Enter your name
            {test.accessMode === 'WHITELIST'
              ? ' and the phone number your administrator registered.'
              : test.accessMode === 'INVITE'
                ? ' and your invitation code.'
                : ' to start the test.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleStart} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name" className="text-xs">Your name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Ahmed Khan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={starting}
              />
            </div>
            {test.accessMode === 'WHITELIST' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="identifier" className="text-xs">Phone number</Label>
                <Input
                  id="identifier"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+92 300 1234567"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={starting}
                />
              </div>
            )}
            {test.accessMode === 'INVITE' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite" className="text-xs">Invitation code</Label>
                <Input
                  id="invite"
                  type="text"
                  placeholder="Paste your invite code"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  disabled={starting}
                />
              </div>
            )}
            {test.requireCode && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code" className="text-xs">Access code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="e.g. GK2024"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="font-mono uppercase"
                  disabled={starting}
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span className="text-destructive">{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={starting}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={starting}
                className="flex-1 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
              >
                {starting ? (
                  <><Loader2 className="size-4 animate-spin" /> Starting…</>
                ) : (
                  <><Play className="size-4" /> Start test</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ---- phase: taking ---------------------------------------------------------

function Taking({
  test,
  sessionRef,
  sessionToken,
  onSubmitted,
  onSessionLost,
}: {
  test: ParticipantTest
  sessionRef: React.MutableRefObject<string | null>
  sessionToken: string
  onSubmitted: (data: ResultData | null) => void
  onSessionLost: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [loadData, setLoadData] = useState<LoadResponse | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [tabSwitches, setTabSwitches] = useState(0)
  const [warned, setWarned] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const store = useTestStore()
  const tabSwitchesRef = useRef(0)
  tabSwitchesRef.current = tabSwitches

  // Load questions.
  useEffect(() => {
    const token = sessionRef.current
    if (!token) {
      onSessionLost()
      return
    }
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const res = await fetch(`/api/tests/${encodeURIComponent(sessionToken)}/load`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (res.status === 401) {
          onSessionLost()
          return
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json: ApiEnvelope<LoadResponse> = await res.json()
        if (cancelled) return
        if (json.success && json.data) {
          setLoadData(json.data)
          store.hydrate(json.data.answers)
          store.setCurrent(0)
        } else {
          throw new Error(json.message || 'Failed to load test')
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not load the test. Retrying…')
          setTimeout(load, 2000)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [sessionToken])

  // Timer (backend-driven).
  useEffect(() => {
    if (!loadData) return
    const startMs = new Date(loadData.attempt.startTime).getTime()
    const limitMs = loadData.test.timeLimitMinutes ? loadData.test.timeLimitMinutes * 60_000 : null
    if (limitMs === null) return
    const tick = () => {
      const rem = limitMs! - (Date.now() - startMs)
      setRemainingMs(rem)
      if (rem <= 0) {
        clearInterval(interval)
        handleSubmit(true)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [loadData])

  // Auto-save: every 10s flush current question.
  useEffect(() => {
    if (!loadData) return
    const interval = setInterval(() => {
      const q = loadData.questions[store.current]
      if (q) saveAnswer(q.id)
    }, 10_000)
    return () => clearInterval(interval)
  }, [loadData, store.current])

  // Anti-cheat: tab switching.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        setTabSwitches((n) => {
          const next = n + 1
          tabSwitchesRef.current = next
          if (next >= 3) {
            handleSubmit(true)
          } else {
            setWarned(next)
            toast.warning(`Tab switch detected (${next}/3). After 3, your test is auto-submitted.`)
          }
          return next
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const saveAnswer = useCallback(
    async (questionId: string) => {
      const token = sessionRef.current
      if (!token || !loadData) return
      const attemptId =
        sessionStorage.getItem('testigo:attemptId') ??
        extractAttemptId(token)
      if (!attemptId) {
        onSessionLost()
        return
      }
      setSaveState('saving')
      try {
        const res = await fetch(`/api/attempts/${attemptId}/save`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ questionId, answer: store.answers[questionId] ?? null }),
        })
        if (res.status === 401) {
          onSessionLost()
          return
        }
        if (res.ok) {
          setSaveState('saved')
        } else {
          toast.error("Couldn't save answer — check your connection.")
        }
      } catch {
        toast.error("Couldn't save answer — check your connection.")
      } finally {
        setTimeout(() => setSaveState('idle'), 800)
      }
    },
    [loadData, store.answers, onSessionLost, sessionRef]
  )

  async function handleSubmit(auto: boolean) {
    if (submitting) return
    setSubmitting(true)
    const token = sessionRef.current
    if (!token || !loadData) {
      setSubmitting(false)
      return
    }
    const attemptId = sessionStorage.getItem('testigo:attemptId') ?? extractAttemptId(token)
    // Flush all answers.
    const answers: Record<string, unknown> = {}
    for (const q of loadData.questions) {
      answers[q.id] = store.answers[q.id] ?? null
    }
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          answers,
          tabSwitches: tabSwitchesRef.current,
          auto,
        }),
      })
      const json: ApiEnvelope<ResultData> = await res.json()
      if (res.ok && json.success && json.data) {
        sessionStorage.removeItem('testigo:session')
        sessionStorage.removeItem('testigo:attemptId')
        sessionRef.current = null
        onSubmitted(json.data)
      } else {
        toast.error(json.message ?? 'Submission failed. Try again.')
        setSubmitting(false)
      }
    } catch {
      toast.error('Network error during submission. Try again.')
      setSubmitting(false)
    }
  }

  if (loading || !loadData) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="mb-6 h-1.5 w-full rounded-full" />
        <Card>
          <CardHeader className="gap-4">
            <Skeleton className="h-6 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  const questions = loadData.questions
  const current = store.current
  const q = questions[current]
  const isLast = current === questions.length - 1
  const answeredCount = questions.filter((qq) => {
    const a = store.answers[qq.id]
    return a !== undefined && a !== null && (Array.isArray(a) ? a.length > 0 : String(a).trim() !== '')
  }).length

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar: timer + save state */}
      <div className="sticky top-14 z-20 flex items-center justify-between border-b bg-background/90 px-4 py-2 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {saveState === 'saving' ? (
            <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
          ) : saveState === 'saved' ? (
            <><CheckCircle2 className="size-3.5 text-emerald-600" /> Saved</>
          ) : (
            <><Wifi className="size-3.5" /> Auto-save on</>
          )}
        </div>
        {remainingMs !== null && (
          <div
            className={`flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums ${
              remainingMs < 60_000
                ? 'text-destructive'
                : remainingMs < 5 * 60_000
                  ? 'text-amber-600'
                  : 'text-foreground'
            }`}
          >
            <Clock className="size-4" />
            {fmtDuration(remainingMs)}
          </div>
        )}
      </div>

      {/* Tab-switch warning */}
      {warned > 0 && warned < 3 && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300 sm:px-6">
          Tab switching detected ({warned}/3). After 3 switches your test will be auto-submitted.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* Left: current question */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium">
              Question {current + 1} of {questions.length}
            </span>
            <Badge variant="secondary" className="font-mono">
              {q.type}
            </Badge>
          </div>
          <Progress value={((current + 1) / questions.length) * 100} className="mb-6 h-1.5" />

          <Card>
            <CardHeader className="gap-4">
              <CardTitle className="text-balance text-lg font-semibold leading-relaxed">
                {q.questionText}
              </CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="gap-1">
                  +{q.positiveMarks} {q.positiveMarks === 1 ? 'mark' : 'marks'}
                </Badge>
                {q.negativeMarks > 0 && (
                  <Badge variant="outline" className="gap-1 text-destructive">
                    −{q.negativeMarks}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => store.toggleFlag(q.id)}
                  className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                    store.flagged[q.id]
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <Flag className="size-3.5" />
                  {store.flagged[q.id] ? 'Flagged' : 'Flag'}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {q.type === 'MCQ' || q.type === 'TRUE_FALSE' ? (
                <MCQInput
                  options={q.options}
                  selected={Array.isArray(store.answers[q.id])
                    ? (store.answers[q.id] as unknown[]).map((n) => Number(n)).filter((n) => Number.isFinite(n))
                    : []}
                  onChange={(sel) => {
                    store.setAnswer(q.id, sel)
                    saveAnswer(q.id)
                  }}
                />
              ) : (
                <Textarea
                  placeholder="Type your answer here…"
                  value={(store.answers[q.id] as string) ?? ''}
                  onChange={(e) => store.setAnswer(q.id, e.target.value)}
                  onBlur={() => saveAnswer(q.id)}
                  rows={5}
                  className="resize-y"
                />
              )}
            </CardContent>
          </Card>

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => store.setCurrent(Math.max(0, current - 1))}
              disabled={current === 0}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            {!isLast ? (
              <Button
                onClick={() => store.setCurrent(Math.min(questions.length - 1, current + 1))}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={submitting}>
                    <Send className="size-4" />
                    Review & Submit
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Submit test?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You&apos;ve answered {answeredCount} of {questions.length} questions.
                      You won&apos;t be able to change your answers after submitting.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep working</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleSubmit(false)}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Submit now
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Right: palette — desktop sidebar */}
        <aside className="hidden lg:block lg:w-72 lg:shrink-0">
          <div className="lg:sticky lg:top-32">
            <PaletteContent
              questions={questions}
              current={current}
              answeredCount={answeredCount}
              store={store}
              submitting={submitting}
              onSubmit={() => handleSubmit(false)}
            />
          </div>
        </aside>
      </div>

      {/* Mobile: sticky bottom bar with palette toggle + submit */}
      <div className="sticky bottom-0 z-30 flex items-center gap-2 border-t bg-background/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <Grid className="size-4" />
              Questions
              <Badge variant="secondary" className="ml-1 font-mono">
                {answeredCount}/{questions.length}
              </Badge>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Question palette</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <PaletteContent
                questions={questions}
                current={current}
                answeredCount={answeredCount}
                store={store}
                submitting={submitting}
                onSubmit={() => handleSubmit(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={submitting}
            >
              <Send className="size-4" />
              Submit
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit test?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ve answered {answeredCount} of {questions.length} questions.
                You won&apos;t be able to change your answers after submitting.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleSubmit(false)}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Submit now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

// Extract attemptId from the session token (stored as a JWT; we can't decode
// without verifying, so we stash it in a separate sessionStorage key instead).
function extractAttemptId(_token: string): string | null {
  try {
    return sessionStorage.getItem('testigo:attemptId')
  } catch {
    return null
  }
}

// ---- palette content (shared by desktop sidebar + mobile sheet) ------------

function PaletteContent({
  questions,
  current,
  answeredCount,
  store,
  submitting,
  onSubmit,
}: {
  questions: LoadQuestion[]
  current: number
  answeredCount: number
  store: TestStore
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Question palette</CardTitle>
        <CardDescription className="text-xs">
          {answeredCount} answered · {questions.length - answeredCount} left
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 gap-2">
          {questions.map((qq, i) => {
            const a = store.answers[qq.id]
            const isAnswered = a !== undefined && a !== null && (Array.isArray(a) ? a.length > 0 : String(a).trim() !== '')
            const isFlagged = !!store.flagged[qq.id]
            const isCurrent = i === current
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => store.setCurrent(i)}
                className={`relative flex size-9 items-center justify-center rounded-md border text-xs font-medium transition ${
                  isCurrent
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : isAnswered
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent'
                }`}
                aria-label={`Question ${i + 1}${isAnswered ? ' (answered)' : ''}${isFlagged ? ' (flagged)' : ''}`}
              >
                {i + 1}
                {isFlagged && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500" />
                )}
              </button>
            )
          })}
        </div>

        <Separator className="my-4" />

        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded border border-emerald-500/40 bg-emerald-500/10" /> Answered
          </div>
          <div className="flex items-center gap-2">
            <span className="size-3 rounded border border-border bg-background" /> Not answered
          </div>
          <div className="flex items-center gap-2">
            <span className="relative size-3 rounded border border-border bg-background">
              <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-amber-500" />
            </span>
            Flagged for review
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="mt-4 w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={submitting}>
              <Send className="size-4" />
              Submit test
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit test?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ve answered {answeredCount} of {questions.length} questions.
                You won&apos;t be able to change your answers after submitting.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction
                onClick={onSubmit}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Submit now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

// ---- MCQ input -------------------------------------------------------------

function MCQInput({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: number[]
  onChange: (sel: number[]) => void
}) {
  const opts = Array.isArray(options) ? options : []
  const sel = Array.isArray(selected) ? selected : []
  function toggle(i: number) {
    const set = new Set(sel)
    if (set.has(i)) set.delete(i)
    else set.add(i)
    onChange([...set].sort((a, b) => a - b))
  }
  return (
    <div className="flex flex-col gap-2">
      {opts.map((opt, i) => {
        const checked = sel.includes(i)
        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition ${
              checked
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                : 'hover:bg-accent'
            }`}
          >
            <Checkbox checked={checked} className="mt-0.5" />
            <span className="flex-1">{String(opt)}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---- phase: result ---------------------------------------------------------

function Result({ result, onHome }: { result: ResultData | null; onHome: () => void }) {
  const reduceMotion = useReducedMotion()

  if (!result) {
    // already-attempted edge case (no result data fetched)
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-12 text-emerald-600" />
          <CardTitle>Already attempted</CardTitle>
          <CardDescription>
            You have already attempted this test. Contact your administrator if you think this is an error.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={onHome}><ArrowLeft className="size-4" /> Back to home</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex w-full max-w-2xl flex-col gap-4"
    >
      <Card>
        <CardHeader className="items-center text-center">
          {result.showResults ? (
            <>
              <CheckCircle2 className="size-12 text-emerald-600" />
              <CardTitle className="text-2xl">Test submitted!</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold text-emerald-600">{result.score}%</span>
              </div>
              {result.correct !== null && (
                <CardDescription>
                  {result.correct} of {result.total} correct
                </CardDescription>
              )}
            </>
          ) : result.resultMode === 'MANUAL' ? (
            <>
              <Clock className="size-12 text-amber-600" />
              <CardTitle className="text-2xl">Results pending</CardTitle>
              <CardDescription>
                Your test has been submitted. Your teacher will release the results.
              </CardDescription>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-12 text-emerald-600" />
              <CardTitle className="text-2xl">Test submitted!</CardTitle>
              <CardDescription>Thank you for completing the test.</CardDescription>
            </>
          )}
          {result.autoSubmitted && (
            <Badge variant="secondary" className="mt-2">Auto-submitted</Badge>
          )}
          {result.pending > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {result.pending} question{result.pending > 1 ? 's' : ''} pending manual grading. Final score may change.
            </p>
          )}
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={onHome}><ArrowLeft className="size-4" /> Back to home</Button>
        </CardContent>
      </Card>

      {result.showResults && result.answers && result.answers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review — questions &amp; answers</CardTitle>
            <CardDescription>
              Your selected answer is highlighted. The correct answer is marked with a check.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {result.answers.map((a, i) => {
              // Normalize to numbers — JSON may return ["1"] instead of [1].
              const userSel: number[] = Array.isArray(a.userAnswer)
                ? (a.userAnswer as unknown[]).map((n) => Number(n)).filter((n) => Number.isFinite(n))
                : []
              const correct: number[] = Array.isArray(a.correctAnswers)
                ? (a.correctAnswers as unknown[]).map((n) => Number(n)).filter((n) => Number.isFinite(n))
                : []
              const isMcq = a.type === 'MCQ' || a.type === 'TRUE_FALSE'
              return (
                <div key={a.questionId} className="rounded-lg border p-3 sm:p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed">{a.questionText}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {a.isCorrect === true && (
                          <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="size-3" /> Correct
                          </Badge>
                        )}
                        {a.isCorrect === false && (
                          <Badge variant="destructive">
                            <XCircle className="size-3" /> Incorrect
                          </Badge>
                        )}
                        {a.isCorrect === null && (
                          <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            <Clock className="size-3" /> Pending review
                          </Badge>
                        )}
                        <Badge variant="outline" className="font-mono text-xs">
                          {a.marksAwarded !== null ? `+${a.marksAwarded}` : '—'} / {a.positiveMarks}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {isMcq ? (
                    <div className="flex flex-col gap-1.5 sm:pl-10">
                      {a.options.map((opt, oi) => {
                        const userPicked = userSel.includes(oi)
                        const isCorrectOpt = correct.includes(oi)
                        return (
                          <div
                            key={oi}
                            className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-sm sm:gap-2 sm:px-3 ${
                              isCorrectOpt
                                ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30'
                                : userPicked
                                  ? 'border-destructive/40 bg-destructive/5'
                                  : 'border-border'
                            }`}
                          >
                            {isCorrectOpt ? (
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                            ) : userPicked ? (
                              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                            ) : (
                              <span className="mt-0.5 size-4 shrink-0 rounded-full border" />
                            )}
                            <span className={`min-w-0 flex-1 ${isCorrectOpt ? 'font-medium text-emerald-800 dark:text-emerald-200' : ''}`}>
                              {opt}
                            </span>
                            {userPicked && !isCorrectOpt && (
                              <span className="shrink-0 text-xs text-destructive">your answer</span>
                            )}
                            {isCorrectOpt && (
                              <span className="shrink-0 text-xs text-emerald-600">correct</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:pl-10">
                      <div className="rounded-md border border-border bg-muted/30 p-2.5 text-sm">
                        <span className="text-xs font-medium text-muted-foreground">Your answer</span>
                        <p className="mt-1 break-words">{(a.userAnswer as string) || <span className="text-muted-foreground">No answer</span>}</p>
                      </div>
                      <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-2.5 text-sm dark:bg-emerald-950/30">
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Acceptable answers</span>
                        <p className="mt-1 break-words text-emerald-800 dark:text-emerald-200">
                          {(a.correctAnswers as string[]).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}

                  {a.explanation && (
                    <div className="mt-2.5 rounded-md border border-border bg-muted/20 p-2.5 text-sm sm:ml-10 sm:mt-3">
                      <span className="block text-xs font-medium text-muted-foreground">Explanation</span>
                      <p className="mt-1 break-words text-muted-foreground">{a.explanation}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
