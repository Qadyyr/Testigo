'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
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

interface PendingItem {
  responseId: string
  attemptId: string
  identifier: string
  questionId: string
  questionText: string
  userAnswer: string | null
  acceptableAnswers: string[]
  positiveMarks: number
  marksAwarded: number | null
}
interface GradingData {
  pending: PendingItem[]
  count: number
}
interface ApiEnvelope<T> {
  success: boolean
  message?: string
  data?: T
}

export function GradingView() {
  const { params, navigate } = useViewRouter()
  const testId = params.get('id') ?? ''
  const { data: session, status } = useSession()
  const [data, setData] = useState<GradingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

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
        const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/grading`, { credentials: 'include' })
        if (cancelled) return
        if (res.status === 401) { navigateRef.current('login'); return }
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json: ApiEnvelope<GradingData> = await res.json()
        if (cancelled) return
        if (json.success && json.data) {
          setData(json.data)
          // Initialize marks state with empty values
          const m: Record<string, string> = {}
          for (const item of json.data.pending) m[item.responseId] = ''
          setMarks(m)
        } else {
          throw new Error(json.message ?? 'Failed to load grading data')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [status, session, testId])

  async function handleGrade(responseId: string, positiveMarks: number) {
    const raw = marks[responseId]?.trim()
    if (raw === '') {
      toast.error('Enter a mark')
      return
    }
    const num = Number(raw)
    if (!Number.isFinite(num) || num < 0) {
      toast.error('Mark must be a non-negative number')
      return
    }
    setSaving(responseId)
    try {
      const res = await fetch(`/api/admin/responses/${encodeURIComponent(responseId)}/grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ marksAwarded: num }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success(`Graded: ${num} / ${positiveMarks} marks`)
        // Remove the graded item from the list
        if (data) {
          setData({
            ...data,
            pending: data.pending.filter((p) => p.responseId !== responseId),
            count: data.count - 1,
          })
        }
      } else {
        toast.error(json.message ?? 'Could not save grade')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(null)
    }
  }

  if (status === 'loading' || loading) return <GradingSkeleton />
  if (error) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
      <p className="text-sm font-medium text-destructive">Couldn&apos;t load grading data</p>
      <p className="text-xs text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={() => navigate('admin')}>Back to dashboard</Button>
    </div>
  )

  if (!data || data.pending.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('analytics', { id: testId })}>
            <ArrowLeft className="size-4" /> Back to analytics
          </Button>
        </header>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20">
          <CheckCircle2 className="size-12 text-amber-600" />
          <h2 className="text-lg font-semibold">All graded!</h2>
          <p className="text-sm text-muted-foreground">There are no pending short-answer responses to grade.</p>
          <Button onClick={() => navigate('analytics', { id: testId })}>Back to analytics</Button>
        </main>
        <SiteFooter />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('analytics', { id: testId })}>
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Analytics</span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <h1 className="text-sm font-semibold sm:text-base">Grade short answers</h1>
        </div>
        <Badge variant="secondary" className="font-mono">{data.pending.length} pending</Badge>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4">
          {data.pending.map((item, i) => (
            <Card key={item.responseId}>
              <CardHeader className="gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">{item.identifier}</Badge>
                  <Badge variant="outline" className="text-xs">+{item.positiveMarks} marks</Badge>
                </div>
                <CardTitle className="text-sm font-medium leading-relaxed">
                  {item.questionText}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {/* Student's answer */}
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Student&apos;s answer</span>
                  <p className="mt-1 break-words">
                    {item.userAnswer?.trim() || <span className="text-muted-foreground italic">No answer provided</span>}
                  </p>
                </div>
                {/* Acceptable answers */}
                <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Acceptable answers</span>
                  <p className="mt-1 break-words text-amber-800 dark:text-amber-200">
                    {item.acceptableAnswers.join(', ')}
                  </p>
                </div>
                {/* Grade input */}
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`marks-${item.responseId}`} className="text-xs">
                      Marks (0–{item.positiveMarks})
                    </Label>
                    <Input
                      id={`marks-${item.responseId}`}
                      type="number"
                      min={0}
                      max={item.positiveMarks}
                      step="any"
                      placeholder="0"
                      value={marks[item.responseId] ?? ''}
                      onChange={(e) => setMarks((m) => ({ ...m, [item.responseId]: e.target.value }))}
                      className="w-24"
                      disabled={saving === item.responseId}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleGrade(item.responseId, item.positiveMarks)}
                    disabled={saving === item.responseId}
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {saving === item.responseId ? (
                      <><Loader2 className="size-4 animate-spin" /> Saving</>
                    ) : (
                      <>Save grade</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function GradingSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center border-b px-4 sm:px-6">
        <Skeleton className="h-5 w-32" />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  )
}
