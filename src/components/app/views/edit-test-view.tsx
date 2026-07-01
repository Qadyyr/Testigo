'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
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
  const [editTab, setEditTab] = useState<'settings' | 'questions'>('settings')

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
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setEditTab('settings')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${editTab === 'settings' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setEditTab('questions')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${editTab === 'questions' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Questions
            </button>
          </div>
          {test.isPublished ? (
            <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">Published</Badge>
          ) : (
            <Badge variant="secondary">Draft</Badge>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        {editTab === 'settings' && (
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
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Save className="size-4" /> Save settings</>}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditTab('questions')} disabled={saving}>
              Next: Questions <ArrowRight className="size-4" />
            </Button>
          </div>
        </form>
        )}

        {editTab === 'questions' && (
          <QuestionsManager
            testId={testId}
            onBack={() => {
              setEditTab('settings')
              toast.success('Changes saved')
            }}
          />
        )}
      </main>

      <SiteFooter />
    </div>
  )
}

// ---- Questions manager -----------------------------------------------------

interface QItem {
  id: string
  questionText: string
  type: string
  options: unknown[]
  correctAnswers: unknown[]
  explanation: string | null
  positiveMarks: number
  negativeMarks: number
  order: number
}

function QuestionsManager({ testId, onBack }: { testId: string; onBack: () => void }) {
  const [questions, setQuestions] = useState<QItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/questions`, { credentials: 'include' })
      const json = await res.json()
      if (json.success) setQuestions(json.data)
    } catch { /* */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [testId])

  async function handleDelete(qId: string) {
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(qId)}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        toast.success('Question deleted')
        setQuestions((qs) => qs.filter((q) => q.id !== qId))
      } else { toast.error('Could not delete') }
    } catch { toast.error('Network error') }
  }

  async function handleSave(qId: string, data: Partial<QItem>) {
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(qId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(data),
      })
      if (res.ok) {
        toast.success('Question updated')
        setEditingId(null)
        load()
      } else { toast.error('Could not save') }
    } catch { toast.error('Network error') }
  }

  async function handleAdd(data: { questionText: string; type: string; options: unknown[]; correctAnswers: unknown[]; explanation: string | null; positiveMarks: number; negativeMarks: number }) {
    try {
      const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(data),
      })
      if (res.ok) {
        toast.success('Question added')
        setShowAdd(false)
        load()
      } else { toast.error('Could not add') }
    } catch { toast.error('Network error') }
  }

  if (loading) return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Questions ({questions.length})</h2>
          <p className="text-xs text-muted-foreground">Edit, add, or delete questions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back to settings
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="bg-amber-600 text-white hover:bg-amber-700">
            <Plus className="size-4" /> Add question
          </Button>
        </div>
      </div>
    <Card>
      <CardContent className="flex flex-col gap-0">
        {showAdd && (
          <QuestionEditor
            onSave={(data) => handleAdd(data)}
            onCancel={() => setShowAdd(false)}
          />
        )}
        {questions.length === 0 && !showAdd ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No questions yet. Click "Add question" to create one.</p>
        ) : (
          questions.map((q, i) => (
            <div key={q.id} className={i > 0 || showAdd ? 'border-t pt-4' : ''}>
              {editingId === q.id ? (
                <QuestionEditor
                  initial={q}
                  onSave={(data) => handleSave(q.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{q.type === 'TRUE_FALSE' ? 'T/F' : q.type}</Badge>
                      <span className="text-xs text-muted-foreground">+{q.positiveMarks} marks</span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed">{q.questionText}</p>
                    {q.options.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {q.options.length} options · correct: {(q.correctAnswers as number[]).map((a) => q.options[a] ?? a).join(', ')}
                      </p>
                    )}
                    {q.explanation && <p className="mt-1 text-xs text-muted-foreground">Explanation: {q.explanation}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(q.id)}>Edit</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete question {i + 1}?</AlertDialogTitle>
                          <AlertDialogDescription>This permanently removes the question and any student responses to it.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(q.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
    </div>
  )
}

// ---- Inline question editor (add/edit) ------------------------------------

function QuestionEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: QItem
  onSave: (data: { questionText: string; type: string; options: unknown[]; correctAnswers: unknown[]; explanation: string | null; positiveMarks: number; negativeMarks: number }) => void
  onCancel: () => void
}) {
  const [questionText, setQuestionText] = useState(initial?.questionText ?? '')
  const [type, setType] = useState(initial?.type ?? 'MCQ')
  const [optionsText, setOptionsText] = useState(
    initial?.options.length ? (initial.options as string[]).join('\n') : ''
  )
  const [correctText, setCorrectText] = useState(
    initial?.correctAnswers.length
      ? type === 'SHORT'
        ? (initial.correctAnswers as string[]).join('\n')
        : (initial.correctAnswers as number[]).map((n) => String(n + 1)).join(',')
      : ''
  )
  const [explanation, setExplanation] = useState(initial?.explanation ?? '')
  const [positiveMarks, setPositiveMarks] = useState(String(initial?.positiveMarks ?? 1))
  const [negativeMarks, setNegativeMarks] = useState(String(initial?.negativeMarks ?? 0))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!questionText.trim()) { toast.error('Question text is required'); return }

    let options: unknown[] = []
    let correctAnswers: unknown[] = []

    if (type === 'MCQ' || type === 'TRUE_FALSE') {
      options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
      if (type === 'TRUE_FALSE' && options.length === 0) options = ['True', 'False']
      const indices = correctText.split(',').map((s) => parseInt(s.trim(), 10) - 1).filter((n) => n >= 0 && n < options.length)
      if (indices.length === 0) { toast.error('Enter correct option number(s) — e.g. "1" or "1,3"'); return }
      correctAnswers = indices
    } else {
      correctAnswers = correctText.split('\n').map((s) => s.trim()).filter(Boolean)
      if (correctAnswers.length === 0) { toast.error('Enter at least one acceptable answer'); return }
    }

    onSave({
      questionText: questionText.trim(),
      type,
      options,
      correctAnswers,
      explanation: explanation.trim() || null,
      positiveMarks: Number(positiveMarks) || 1,
      negativeMarks: Number(negativeMarks) || 0,
    })
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-50/30 p-4 dark:bg-amber-950/10">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{initial ? 'Edit question' : 'New question'}</span>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="size-7"><X className="size-4" /></Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Question text</Label>
          <Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={3} placeholder="Enter the question…" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MCQ">Multiple Choice</SelectItem>
              <SelectItem value="TRUE_FALSE">True / False</SelectItem>
              <SelectItem value="SHORT">Short Answer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(type === 'MCQ' || type === 'TRUE_FALSE') && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Options (one per line)</Label>
              <Textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={4} placeholder={'Option A\nOption B\nOption C\nOption D'} className="font-mono text-xs" />
              {type === 'TRUE_FALSE' && <p className="text-xs text-muted-foreground">Leave empty to auto-generate True/False</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Correct option number(s) — e.g. "1" or "1,3"</Label>
              <Input value={correctText} onChange={(e) => setCorrectText(e.target.value)} placeholder="1" className="font-mono" />
            </div>
          </>
        )}

        {type === 'SHORT' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Acceptable answers (one per line)</Label>
            <Textarea value={correctText} onChange={(e) => setCorrectText(e.target.value)} rows={3} placeholder={'Paris\nparis'} className="font-mono text-xs" />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Explanation (optional)</Label>
          <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} placeholder="Shown to students after submission" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Positive marks</Label>
            <Input type="number" min={0} step="any" value={positiveMarks} onChange={(e) => setPositiveMarks(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Negative marks</Label>
            <Input type="number" min={0} step="any" value={negativeMarks} onChange={(e) => setNegativeMarks(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="sm" className="bg-amber-600 text-white hover:bg-amber-700">
            <Save className="size-3.5" /> {initial ? 'Save' : 'Add'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}