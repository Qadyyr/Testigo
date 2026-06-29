'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Send,
  Sun,
  TrendingUp,
  Users,
  XCircle,
  ArrowLeft,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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

interface QuestionAnalytics {
  id: string
  text: string
  type: string
  order: number
  positiveMarks: number
  correctCount: number
  attemptCount: number
  difficulty: number | null
}
interface AnalyticsData {
  test: { id: string; title: string; resultReleaseMode: string }
  totalAttempts: number
  avgScore: number
  scoreDistribution: Record<string, number>
  questions: QuestionAnalytics[]
  pendingShortGrading: number
}
interface ApiEnvelope<T> {
  success: boolean
  message?: string
  data?: T
}

function typeLabel(t: string): string {
  switch (t) {
    case 'MCQ': return 'MCQ'
    case 'TRUE_FALSE': return 'T/F'
    case 'SHORT': return 'Short'
    default: return t
  }
}

function difficultyColor(d: number | null): string {
  if (d === null) return 'text-muted-foreground'
  if (d >= 75) return 'text-amber-600'
  if (d >= 50) return 'text-amber-600'
  return 'text-destructive'
}

export function AnalyticsView() {
  const { params, navigate } = useViewRouter()
  const testId = params.get('id') ?? ''
  const { data: session, status } = useSession()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  // Theme toggle
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme: rt, setTheme: setT } = useTheme()
  useEffect(() => {
    setMounted(true)
  }, [])
  function ThemeToggle() {
    if (!mounted) return <Button variant="ghost" size="icon" disabled><Sun className="size-4" /></Button>
    const isDark = rt === 'dark'
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setT(isDark ? 'light' : 'dark')}>
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    )
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status !== 'authenticated' || (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'SUPER_ADMIN')) {
      navigateRef.current('login')
      return
    }
    if (!testId) {
      navigateRef.current('admin')
      return
    }
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/analytics`, { credentials: 'include' })
        if (cancelled) return
        if (res.status === 401) { navigateRef.current('login'); return }
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json: ApiEnvelope<AnalyticsData> = await res.json()
        if (cancelled) return
        if (json.success && json.data) setData(json.data)
        else throw new Error(json.message ?? 'Failed to load analytics')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [status, session, testId])

  async function handleExportCsv() {
    try {
      const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/results?format=csv`, { credentials: 'include' })
      if (!res.ok) throw new Error('Export failed')
      const csv = await res.text()
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data?.test.title?.replace(/[^a-z0-9]/gi, '_') ?? 'test'}_results.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported')
    } catch {
      toast.error('Could not export CSV')
    }
  }

  async function handleRelease() {
    setReleasing(true)
    try {
      const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/release`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success(`Results released to ${json.data.attemptCount} participants`)
        // Refresh data
        if (data) setData({ ...data, test: { ...data.test, resultReleaseMode: 'IMMEDIATE' } })
      } else {
        toast.error(json.message ?? 'Could not release results')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setReleasing(false)
    }
  }

  if (status === 'loading' || loading) return <AnalyticsSkeleton />
  if (error || !data) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
      <p className="text-sm font-medium text-destructive">Couldn&apos;t load analytics</p>
      <p className="text-xs text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={() => navigate('admin')}>Back to dashboard</Button>
    </div>
  )

  const chartData = Object.entries(data.scoreDistribution).map(([range, count]) => ({ range, count }))
  const isManual = data.test.resultReleaseMode === 'MANUAL'

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('admin')}>
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <BarChart3 className="size-4 text-amber-600" />
          <h1 className="truncate text-sm font-semibold sm:text-base">{data.test.title}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => navigate('admin')} className="text-muted-foreground">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Exit</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Attempts</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                  {data.totalAttempts}
                  <Users className="size-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg Score</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                  {data.totalAttempts > 0 ? `${data.avgScore}%` : '—'}
                  <TrendingUp className="size-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Questions</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                  {data.questions.length}
                  <FileText className="size-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pending Grading</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                  {data.pendingShortGrading}
                  {data.pendingShortGrading > 0 && <Clock className="size-4 text-amber-600" />}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={data.totalAttempts === 0}>
              <Download className="size-4" />
              Export CSV
            </Button>
            {data.pendingShortGrading > 0 && (
              <Button variant="outline" size="sm" onClick={() => navigate('grading', { id: testId })}>
                <FileText className="size-4" />
                Grade SHORT answers ({data.pendingShortGrading})
              </Button>
            )}
            {isManual && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-700" disabled={releasing}>
                    <Send className="size-4" />
                    Release results
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Release results to students?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {data.totalAttempts} student(s) will be able to see their scores immediately.
                      This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRelease} className="bg-amber-600 text-white hover:bg-amber-700">
                      Release now
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {!isManual && data.test.resultReleaseMode === 'IMMEDIATE' && (
              <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <CheckCircle2 className="size-3" /> Results live
              </Badge>
            )}
          </div>

          {/* Score distribution chart */}
          {data.totalAttempts > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Score distribution</CardTitle>
                <CardDescription>How students scored across ranges</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" fill="oklch(0.769 0.188 70.08)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Per-question difficulty */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Question difficulty</CardTitle>
              <CardDescription>% of students who answered each question correctly</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.questions.map((q, i) => (
                <div key={q.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">{typeLabel(q.type)}</Badge>
                      {q.difficulty !== null && (
                        <span className={`text-sm font-semibold tabular-nums ${difficultyColor(q.difficulty)}`}>
                          {q.difficulty}% correct
                        </span>
                      )}
                      {q.difficulty === null && (
                        <span className="text-xs text-muted-foreground">No attempts yet</span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{q.text}</p>
                    {q.difficulty !== null && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            (q.difficulty ?? 0) >= 75 ? 'bg-amber-500'
                            : (q.difficulty ?? 0) >= 50 ? 'bg-amber-500'
                            : 'bg-destructive'
                          }`}
                          style={{ width: `${q.difficulty ?? 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center border-b px-4 sm:px-6">
        <Skeleton className="h-5 w-32" />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
        <Skeleton className="mt-6 h-48 w-full rounded-xl" />
      </main>
    </div>
  )
}
