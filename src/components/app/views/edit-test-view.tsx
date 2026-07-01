'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

interface TestData {
  id: string
  title: string
  description: string | null
  startTime: string | null
  endTime: string | null
  timezone: string | null
  timeLimitMinutes: number | null
  accessMode: string
  requireCode: boolean
  accessCode: string | null
  maxAttempts: number
  resultReleaseMode: string
  positiveMarks: number
  negativeMarks: number
  isPublished: boolean
  shareableLink: string
  questionCount: number
  attemptCount: number
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

export function EditTestView() {
  const { params, navigate } = useViewRouter()
  const testId = params.get('id') ?? ''
  const { data: session, status } = useSession()
  const [test, setTest] = useState<TestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [timezone, setTimezone] = useState('Asia/Karachi')
  const [timeLimit, setTimeLimit] = useState('')
  const [maxAttempts, setMaxAttempts] = useState('0')
  const [resultMode, setResultMode] = useState('IMMEDIATE')
  const [positiveMarks, setPositiveMarks] = useState('1')
  const [negativeMarks, setNegativeMarks] = useState('0')
  const [requireCode, setRequireCode] = useState(false)
  const [isPublished, setIsPublished] = useState(false)

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (status === 'loading') return
    if (status !== 'authenticated' || (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'SUPER_ADMIN')) {
      navigateRef.current('login')
    }
  }, [status, session])

  useEffect(() => {
    if (!testId) {
      navigateRef.current('admin')
      return
    }
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}`, { credentials: 'include' })
        if (cancelled) return
        if (res.status === 401) { navigateRef.current('login'); return }
        if (!res.ok) throw new Error('Failed to load test')
        const json = await res.json()
        if (cancelled) return
        if (json.success && json.data) {
          const t = json.data as TestData
          setTest(t)
          setTitle(t.title)
          setDescription(t.description ?? '')
          setStartTime(toDatetimeLocal(t.startTime))
          setEndTime(toDatetimeLocal(t.endTime))
          setTimezone(t.timezone ?? 'Asia/Karachi')
          setTimeLimit(t.timeLimitMinutes?.toString() ?? '')
          setMaxAttempts(t.maxAttempts.toString())
          setResultMode(t.resultReleaseMode)
          setPositiveMarks(t.positiveMarks.toString())
          setNegativeMarks(t.negativeMarks.toString())
          setRequireCode(t.requireCode)
          setIsPublished(t.isPublished)
        }
      } catch {
        if (!cancelled) toast.error('Could not load test')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [testId])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('Title is required'); return }

    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      startTime: startTime ? new Date(startTime).toISOString() : null,
      endTime: endTime ? new Date(endTime).toISOString() : null,
      timezone: timezone.trim() || null,
      timeLimitMinutes: timeLimit.trim() ? Number(timeLimit) : null,
      maxAttempts: Number(maxAttempts) || 0,
      resultReleaseMode: resultMode,
      positiveMarks: Number(positiveMarks) || 1,
      negativeMarks: Number(negativeMarks) || 0,
      requireCode,
      isPublished,
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Test updated')
        navigate('analytics', { id: testId })
      } else {
        toast.error(json.message ?? 'Could not save')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center border-b px-4 sm:px-6">
          <Skeleton className="h-5 w-32" />
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="mt-4 h-32 w-full" />
          <Skeleton className="mt-4 h-48 w-full" />
        </main>
      </div>
    )
  }

  if (!test) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm text-muted-foreground">Test not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('admin')}>Back to dashboard</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('analytics', { id: testId })}>
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <h1 className="truncate text-sm font-semibold sm:text-base">Edit test</h1>
        </div>
        {test.isPublished ? (
          <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">Published</Badge>
        ) : (
          <Badge variant="secondary">Draft</Badge>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title" className="text-xs">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="desc" className="text-xs">Description</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} disabled={saving} />
              </div>
            </CardContent>
          </Card>

          {/* Schedule & Time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule & time</CardTitle>
              <CardDescription>Leave blank for no schedule / no limit</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start" className="text-xs">Start time</Label>
                <Input id="start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="end" className="text-xs">End time</Label>
                <Input id="end" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tz" className="text-xs">Timezone</Label>
                <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="limit" className="text-xs">Time limit (minutes)</Label>
                <Input id="limit" type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="No limit" disabled={saving} />
              </div>
            </CardContent>
          </Card>

          {/* Marking & attempts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marking & attempts</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pos" className="text-xs">Positive marks</Label>
                <Input id="pos" type="number" min={0} step="any" value={positiveMarks} onChange={(e) => setPositiveMarks(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="neg" className="text-xs">Negative marks</Label>
                <Input id="neg" type="number" min={0} step="any" value={negativeMarks} onChange={(e) => setNegativeMarks(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="att" className="text-xs">Max attempts (0=unlimited)</Label>
                <Input id="att" type="number" min={0} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} disabled={saving} />
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Results</CardTitle>
            </CardHeader>
            <CardContent>
              <Label className="text-xs">Result release mode</Label>
              <RadioGroup value={resultMode} onValueChange={setResultMode} className="mt-2 flex flex-col gap-2">
                <Label htmlFor="r-imm" className="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem id="r-imm" value="IMMEDIATE" />
                  <span className="text-sm">Immediate — students see results right after submitting</span>
                </Label>
                <Label htmlFor="r-man" className="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem id="r-man" value="MANUAL" />
                  <span className="text-sm">Manual — release results later from analytics</span>
                </Label>
                <Label htmlFor="r-nev" className="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem id="r-nev" value="NEVER" />
                  <span className="text-sm">Never — students never see their score</span>
                </Label>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Access code toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access code</CardTitle>
              <CardDescription>Test code: <span className="font-mono font-semibold text-amber-600">{test.accessCode}</span></CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="req-code" className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition hover:bg-accent">
                <Switch id="req-code" checked={requireCode} onCheckedChange={setRequireCode} disabled={saving} />
                <div className="flex-1 space-y-1">
                  <span className="text-sm font-medium">Require code at the gate</span>
                  <p className="text-xs text-muted-foreground">Students must re-enter the code before starting (extra security for exams).</p>
                </div>
              </Label>
            </CardContent>
          </Card>

          {/* Publish toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publication</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="pub" className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition hover:bg-accent">
                <Switch id="pub" checked={isPublished} onCheckedChange={setIsPublished} disabled={saving} />
                <div className="flex-1 space-y-1">
                  <span className="text-sm font-medium">Published</span>
                  <p className="text-xs text-muted-foreground">Students can access this test via code or link. Unpublish to temporarily hide it.</p>
                </div>
              </Label>
            </CardContent>
          </Card>

          {/* Info */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{test.questionCount} questions</span>
            <span>{test.attemptCount} attempts</span>
            <span>Code: <span className="font-mono font-semibold text-amber-600">{test.accessCode}</span></span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pb-6">
            <Button type="submit" disabled={saving} className="bg-amber-600 text-white hover:bg-amber-700">
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Save className="size-4" /> Save changes</>}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('analytics', { id: testId })} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </main>

      <SiteFooter />
    </div>
  )
}
