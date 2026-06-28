'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Globe,
  Link as LinkIcon,
  Loader2,
  Lock,
  Ticket,
  Users,
  Upload,
  AlertCircle,
  Clock,
  Trophy,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'
import {
  SAMPLE_CSV,
  SAMPLE_JSON,
  SAMPLE_MD,
  type DryRunResult,
  type ParseFormat,
  type ParsedQuestion,
} from '@/lib/question-parser'
import { cn } from '@/lib/utils'

// ---- Shared types -----------------------------------------------------------

type Step = 1 | 2 | 3 | 4
type AccessMode = 'PUBLIC' | 'WHITELIST' | 'INVITE'
type ResultReleaseMode = 'IMMEDIATE' | 'MANUAL' | 'NEVER'

interface DryRunState {
  status: 'idle' | 'loading' | 'done'
  result?: DryRunResult
}

interface Settings {
  startTime: string
  endTime: string
  timezone: string
  timeLimitMinutes: string
  positiveMarks: string
  negativeMarks: string
  maxAttempts: string
  resultReleaseMode: ResultReleaseMode
}

interface CreatedTest {
  id?: string
  shareableLink: string
  questionCount: number
  isPublished: boolean
  inviteLinks?: string[]
}

interface ApiOk<T> {
  success: true
  data: T
  message?: string
}
interface ApiErr {
  success: false
  message: string
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Details & Import' },
  { n: 2, label: 'Settings' },
  { n: 3, label: 'Access Control' },
  { n: 4, label: 'Review' },
]

const ACCESS_MODES: {
  value: AccessMode
  title: string
  description: string
  icon: typeof Globe
}[] = [
  {
    value: 'PUBLIC',
    title: 'Public',
    description: 'Anyone with the link can take this test.',
    icon: Globe,
  },
  {
    value: 'WHITELIST',
    title: 'Whitelist',
    description: 'Only registered phone numbers can access.',
    icon: Users,
  },
  {
    value: 'INVITE',
    title: 'Invitation links',
    description: 'Single-use unique links per student.',
    icon: Ticket,
  },
]

const INITIAL_SETTINGS: Settings = {
  startTime: '',
  endTime: '',
  timezone: 'Asia/Karachi',
  timeLimitMinutes: '',
  positiveMarks: '1',
  negativeMarks: '0',
  maxAttempts: '1',
  resultReleaseMode: 'IMMEDIATE',
}

// ---- Main view --------------------------------------------------------------

export function CreateTestView() {
  const { data: session, status } = useSession()
  const { navigate } = useViewRouter()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [format, setFormat] = useState<ParseFormat>('md')
  const [content, setContent] = useState('')
  const [dryRun, setDryRun] = useState<DryRunState>({ status: 'idle' })
  const [imported, setImported] = useState<ParsedQuestion[] | null>(null)

  // Step 2
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS)

  // Step 3
  const [accessMode, setAccessMode] = useState<AccessMode>('PUBLIC')
  const [requireCode, setRequireCode] = useState(false)
  const [accessCode, setAccessCode] = useState('')
  const [whitelistText, setWhitelistText] = useState('')
  const [inviteCount, setInviteCount] = useState('10')

  // Step 4
  const [isPublished, setIsPublished] = useState(false)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedTest | null>(null)

  // window.location.origin is only available client-side; track it in state to
  // avoid SSR/hydration mismatch when rendering the success screen links.
  const [origin, setOrigin] = useState('')
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const getRole = () =>
    (session?.user as { role?: string } | undefined)?.role
  const isAdmin =
    status === 'authenticated' &&
    (getRole() === 'ADMIN' || getRole() === 'SUPER_ADMIN')

  // Auth guard: redirect unauthenticated / non-admin users to login.
  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) {
      navigateRef.current('login')
    }
  }, [status, session, isAdmin])

  // ---- handlers ----

  const loadSample = useCallback(() => {
    const sample =
      format === 'csv' ? SAMPLE_CSV : format === 'json' ? SAMPLE_JSON : SAMPLE_MD
    setContent(sample)
    setDryRun({ status: 'idle' })
    setImported(null)
  }, [format])

  const onFormatChange = useCallback((next: ParseFormat) => {
    setFormat(next)
    setDryRun({ status: 'idle' })
    setImported(null)
  }, [])

  const onContentChange = useCallback((val: string) => {
    setContent(val)
    // Editing the source invalidates a shown dry-run (stale results), but a
    // previously committed import persists until the next dry run.
    setDryRun({ status: 'idle' })
  }, [])

  const runDryRun = useCallback(async () => {
    if (!content.trim()) {
      toast.error('Paste some content first.')
      return
    }
    setDryRun({ status: 'loading' })
    setImported(null)
    try {
      const res = await fetch('/api/admin/tests/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ format, content }),
      })
      if (res.status === 401) {
        navigateRef.current('login')
        return
      }
      if (!res.ok) {
        const json: ApiErr = await res.json().catch(() => ({
          success: false,
          message: `Request failed (${res.status})`,
        }))
        throw new Error(json.message || `Request failed (${res.status})`)
      }
      const json: ApiOk<DryRunResult> = await res.json()
      setDryRun({ status: 'done', result: json.data })
      if (json.data.valid.length > 0) {
        toast.success(
          `${json.data.valid.length} valid question${
            json.data.valid.length === 1 ? '' : 's'
          } parsed.`
        )
      } else {
        toast.error('No valid questions found.')
      }
    } catch (e) {
      setDryRun({ status: 'idle' })
      toast.error(e instanceof Error ? e.message : 'Network error')
    }
  }, [content, format])

  const commitImport = useCallback(() => {
    if (dryRun.status === 'done' && dryRun.result?.valid.length) {
      setImported(dryRun.result.valid)
      toast.success(
        `${dryRun.result.valid.length} question${
          dryRun.result.valid.length === 1 ? '' : 's'
        } imported.`
      )
    }
  }, [dryRun])

  const resetAll = useCallback(() => {
    setStep(1)
    setTitle('')
    setDescription('')
    setFormat('md')
    setContent('')
    setDryRun({ status: 'idle' })
    setImported(null)
    setSettings(INITIAL_SETTINGS)
    setAccessMode('PUBLIC')
    setAccessCode('')
    setWhitelistText('')
    setInviteCount('10')
    setIsPublished(false)
    setCreated(null)
  }, [])

  const copyToClipboard = useCallback(
    async (text: string, successMsg = 'Copied to clipboard') => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(successMsg)
      } catch {
        toast.error('Failed to copy. Select and copy manually.')
      }
    },
    []
  )

  const handleCreate = useCallback(async () => {
    if (!imported || imported.length === 0) {
      toast.error('No questions to publish.')
      return
    }
    if (!title.trim()) {
      toast.error('Title is required.')
      setStep(1)
      return
    }
    setCreating(true)
    try {
      const numOr = (v: string, fallback: number) => {
        const t = v.trim()
        if (t === '') return fallback
        const n = Number(t)
        return Number.isFinite(n) ? n : fallback
      }
      const isoOrNull = (v: string) => {
        const t = v.trim()
        if (!t) return null
        const d = new Date(t)
        return Number.isNaN(d.getTime()) ? null : d.toISOString()
      }

      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: isoOrNull(settings.startTime),
        endTime: isoOrNull(settings.endTime),
        timezone: settings.timezone.trim() || null,
        timeLimitMinutes: settings.timeLimitMinutes.trim()
          ? Number(settings.timeLimitMinutes)
          : null,
        accessMode,
        requireCode,
        accessCode: requireCode ? accessCode.trim() || undefined : undefined,
        maxAttempts: numOr(settings.maxAttempts, 1),
        resultReleaseMode: settings.resultReleaseMode,
        positiveMarks: numOr(settings.positiveMarks, 1),
        negativeMarks: numOr(settings.negativeMarks, 0),
        isPublished,
        questions: imported,
        whitelist:
          accessMode === 'WHITELIST'
            ? whitelistText
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        inviteCount:
          accessMode === 'INVITE' ? Number(inviteCount) || 10 : undefined,
      }

      const res = await fetch('/api/admin/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        navigateRef.current('login')
        return
      }
      const json: ApiOk<CreatedTest> | ApiErr = await res.json()
      if (!res.ok || !json.success) {
        const msg = (json as ApiErr).message || `Request failed (${res.status})`
        toast.error(msg)
        return
      }
      setCreated(json.data)
      toast.success(
        isPublished ? 'Test published.' : 'Test saved as draft.'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Network error')
    } finally {
      setCreating(false)
    }
  }, [
    imported,
    title,
    description,
    settings,
    accessMode,
    accessCode,
    whitelistText,
    inviteCount,
    isPublished,
  ])

  // ---- render gates ----

  if (status === 'loading' || !isAdmin) {
    return <CreateTestSkeleton />
  }

  const canStep1Next = !!imported && imported.length > 0

  return (
    <div className="flex flex-1 flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('admin')}
              className="rounded-md transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label="Back to dashboard"
            >
              <Brand />
            </button>
            <span className="text-sm text-muted-foreground">
              Step{' '}
              <span className="font-semibold text-foreground">{step}</span> of 4
            </span>
          </div>
          <StepIndicator step={step} onJump={(n) => setStep(n)} />
        </div>
      </header>

      {/* Main wizard content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {created ? (
          <SuccessScreen
            created={created}
            origin={origin}
            onDashboard={() => navigate('admin')}
            onReset={resetAll}
            onCopy={copyToClipboard}
          />
        ) : step === 1 ? (
          <Step1Details
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            format={format}
            onFormatChange={onFormatChange}
            content={content}
            onContentChange={onContentChange}
            onLoadSample={loadSample}
            dryRun={dryRun}
            onRunDryRun={runDryRun}
            imported={imported}
            onImport={commitImport}
            onRerun={runDryRun}
            onCancel={() => navigate('admin')}
            onNext={() => setStep(2)}
            canNext={canStep1Next}
          />
        ) : step === 2 ? (
          <Step2Settings
            settings={settings}
            setSettings={setSettings}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        ) : step === 3 ? (
          <Step3Access
            accessMode={accessMode}
            setAccessMode={setAccessMode}
            requireCode={requireCode}
            setRequireCode={setRequireCode}
            accessCode={accessCode}
            setAccessCode={setAccessCode}
            whitelistText={whitelistText}
            setWhitelistText={setWhitelistText}
            inviteCount={inviteCount}
            setInviteCount={setInviteCount}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        ) : (
          <Step4Review
            title={title}
            description={description}
            imported={imported}
            settings={settings}
            accessMode={accessMode}
            requireCode={requireCode}
            accessCode={accessCode}
            whitelistText={whitelistText}
            inviteCount={inviteCount}
            isPublished={isPublished}
            setIsPublished={setIsPublished}
            creating={creating}
            onCreate={handleCreate}
            onBack={() => setStep(3)}
          />
        )}
      </main>

      <SiteFooter />
    </div>
  )
}

// ---- Step indicator ---------------------------------------------------------

function StepIndicator({
  step,
  onJump,
}: {
  step: Step
  onJump: (n: Step) => void
}) {
  return (
    <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
      {STEPS.map((s, i) => {
        const completed = s.n < step
        const current = s.n === step
        const clickable = s.n <= step
        return (
          <Fragment key={s.n}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onJump(s.n)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs transition',
                current
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : completed
                    ? 'text-foreground hover:bg-accent'
                    : 'cursor-not-allowed text-muted-foreground'
              )}
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                  current
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : completed
                      ? 'border-emerald-600 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-muted-foreground/30 text-muted-foreground'
                )}
              >
                {completed ? <Check className="size-3.5" /> : s.n}
              </span>
              <span className="font-medium">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  'h-px w-4 shrink-0 sm:w-8',
                  completed ? 'bg-emerald-500' : 'bg-border'
                )}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

// ---- Step 1: Details & Import ----------------------------------------------

function Step1Details({
  title,
  setTitle,
  description,
  setDescription,
  format,
  onFormatChange,
  content,
  onContentChange,
  onLoadSample,
  dryRun,
  onRunDryRun,
  imported,
  onImport,
  onRerun,
  onCancel,
  onNext,
  canNext,
}: {
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  format: ParseFormat
  onFormatChange: (f: ParseFormat) => void
  content: string
  onContentChange: (v: string) => void
  onLoadSample: () => void
  dryRun: DryRunState
  onRunDryRun: () => void
  imported: ParsedQuestion[] | null
  onImport: () => void
  onRerun: () => void
  onCancel: () => void
  onNext: () => void
  canNext: boolean
}) {
  const formats: { value: ParseFormat; label: string }[] = [
    { value: 'md', label: 'Markdown' },
    { value: 'csv', label: 'CSV' },
    { value: 'json', label: 'JSON' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Create a test
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the details, paste your questions, and run a dry run to validate
          before importing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test details</CardTitle>
          <CardDescription>
            Basic information shown to participants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="test-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midterm Mathematics 2024"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-description">Description</Label>
            <Textarea
              id="test-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary or instructions for participants."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import questions</CardTitle>
          <CardDescription>
            Paste questions in Markdown, CSV, or JSON. Nothing is saved until
            you import.
          </CardDescription>
          <CardAction>
            {imported && imported.length > 0 ? (
              <Badge className="border-transparent bg-emerald-600 text-white">
                <CheckCircle2 className="size-3" />
                {imported.length} imported
              </Badge>
            ) : null}
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Format selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Format:</span>
            <div
              role="group"
              aria-label="Question format"
              className="inline-flex rounded-lg border bg-muted/40 p-1"
            >
              {formats.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={format === f.value}
                  onClick={() => onFormatChange(f.value)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition',
                    format === f.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoadSample}
            >
              <Upload className="size-3.5" />
              Load sample
            </Button>
          </div>

          {/* Content textarea */}
          <Textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder={
              format === 'md'
                ? '### Question text\n- [ ] option A\n- [x] option B\n> Explanation (optional)'
                : format === 'csv'
                  ? 'questionText,type,options,correctAnswers,explanation\n"What is 2+2?",MCQ,"1;2;3;4","3","2+2 = 4."'
                  : '[\n  { "questionText": "What is 2+2?", "type": "MCQ", "options": ["1","2","3","4"], "correctAnswers": [3], "explanation": "2+2 = 4." }\n]'
            }
            rows={12}
            className="resize-y font-mono text-xs leading-relaxed"
            spellCheck={false}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={onRunDryRun}
              disabled={dryRun.status === 'loading' || !content.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {dryRun.status === 'loading' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <FileText className="size-4" />
                  Run dry run
                </>
              )}
            </Button>
            {dryRun.status === 'done' && dryRun.result ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-transparent bg-emerald-600 text-white">
                  <Check className="size-3" />
                  {dryRun.result.valid.length} valid
                </Badge>
                <Badge
                  variant={dryRun.result.errors.length ? 'destructive' : 'secondary'}
                >
                  <AlertCircle className="size-3" />
                  {dryRun.result.errors.length} errors
                </Badge>
              </div>
            ) : null}
          </div>

          {/* Dry-run results */}
          {dryRun.status === 'done' && dryRun.result ? (
            <DryRunResults
              result={dryRun.result}
              imported={imported}
              onImport={onImport}
              onRerun={onRerun}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {canNext ? (
          <Button
            type="button"
            onClick={onNext}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button type="button" disabled>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Import at least one question first</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function DryRunResults({
  result,
  imported,
  onImport,
  onRerun,
}: {
  result: DryRunResult
  imported: ParsedQuestion[] | null
  onImport: () => void
  onRerun: () => void
}) {
  const hasImported = !!imported && imported.length > 0
  return (
    <div className="space-y-4">
      {result.errors.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">
            {result.errors.length} error
            {result.errors.length === 1 ? '' : 's'} found
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead className="w-1/3">Excerpt</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.row || '—'}
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                      {e.excerpt || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-destructive">
                      {e.error}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {result.valid.length > 0 ? (
        hasImported ? (
          <Alert className="border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="size-4" />
            <AlertTitle>
              {imported?.length} question{imported?.length === 1 ? '' : 's'} imported
            </AlertTitle>
            <AlertDescription>
              You can edit the content and run the dry run again to replace the
              imported set.
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRerun}
                >
                  <FileText className="size-3.5" />
                  Re-run
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="size-4" />
            <AlertTitle>
              {result.valid.length} question
              {result.valid.length === 1 ? '' : 's'} ready to import
            </AlertTitle>
            <AlertDescription>
              Review the errors above (if any), then import the valid questions
              to continue.
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={onImport}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check className="size-3.5" />
                  Import {result.valid.length} valid question
                  {result.valid.length === 1 ? '' : 's'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )
      ) : null}
    </div>
  )
}

// ---- Step 2: Settings -------------------------------------------------------

function Step2Settings({
  settings,
  setSettings,
  onBack,
  onNext,
}: {
  settings: Settings
  setSettings: Dispatch<SetStateAction<Settings>>
  onBack: () => void
  onNext: () => void
}) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Test settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure schedule, time limits, marking, and result release.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4 text-emerald-600" />
            Schedule
          </CardTitle>
          <CardDescription>
            Optional. Leave blank for no schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start-time">Start time</Label>
            <Input
              id="start-time"
              type="datetime-local"
              value={settings.startTime}
              onChange={(e) => update('startTime', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-time">End time</Label>
            <Input
              id="end-time"
              type="datetime-local"
              value={settings.endTime}
              onChange={(e) => update('endTime', e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={settings.timezone}
              onChange={(e) => update('timezone', e.target.value)}
              placeholder="Asia/Karachi"
            />
            <p className="text-xs text-muted-foreground">
              IANA timezone identifier (e.g. Asia/Karachi, America/New_York).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time limit</CardTitle>
          <CardDescription>
            Optional. Leave blank for no limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="time-limit">Time limit (minutes)</Label>
          <Input
            id="time-limit"
            type="number"
            min={0}
            value={settings.timeLimitMinutes}
            onChange={(e) => update('timeLimitMinutes', e.target.value)}
            placeholder="e.g. 60"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-emerald-600" />
            Marking &amp; attempts
          </CardTitle>
          <CardDescription>
            Marks awarded for every question in this test.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="positive-marks">Positive marks</Label>
            <Input
              id="positive-marks"
              type="number"
              min={0}
              step="any"
              value={settings.positiveMarks}
              onChange={(e) => update('positiveMarks', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="negative-marks">Negative marks</Label>
            <Input
              id="negative-marks"
              type="number"
              min={0}
              step="any"
              value={settings.negativeMarks}
              onChange={(e) => update('negativeMarks', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-attempts">Max attempts</Label>
            <Input
              id="max-attempts"
              type="number"
              min={1}
              value={settings.maxAttempts}
              onChange={(e) => update('maxAttempts', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            When should participants see their results?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={settings.resultReleaseMode}
            onValueChange={(v) =>
              update('resultReleaseMode', v as ResultReleaseMode)
            }
            className="grid gap-2 sm:grid-cols-2"
          >
            <Label
              htmlFor="release-immediate"
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition',
                settings.resultReleaseMode === 'IMMEDIATE'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'hover:bg-accent'
              )}
            >
              <RadioGroupItem
                id="release-immediate"
                value="IMMEDIATE"
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">Immediate</span>
                <span className="block text-xs text-muted-foreground">
                  Participants see results right after submitting.
                </span>
              </span>
            </Label>
            <Label
              htmlFor="release-manual"
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition',
                settings.resultReleaseMode === 'MANUAL'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'hover:bg-accent'
              )}
            >
              <RadioGroupItem
                id="release-manual"
                value="MANUAL"
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">Manual</span>
                <span className="block text-xs text-muted-foreground">
                  Results held until you release them.
                </span>
              </span>
            </Label>
          </RadioGroup>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Next
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ---- Step 3: Access Control -------------------------------------------------

function Step3Access({
  accessMode,
  setAccessMode,
  requireCode,
  setRequireCode,
  accessCode,
  setAccessCode,
  whitelistText,
  setWhitelistText,
  inviteCount,
  setInviteCount,
  onBack,
  onNext,
}: {
  accessMode: AccessMode
  setAccessMode: (m: AccessMode) => void
  requireCode: boolean
  setRequireCode: (v: boolean) => void
  accessCode: string
  setAccessCode: (v: string) => void
  whitelistText: string
  setWhitelistText: (v: string) => void
  inviteCount: string
  setInviteCount: (v: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const whitelistCount = whitelistText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Access control
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how participants will access this test.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access mode</CardTitle>
          <CardDescription>
            You can change this later from the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={accessMode}
            onValueChange={(v) => setAccessMode(v as AccessMode)}
            className="grid gap-3"
          >
            {ACCESS_MODES.map((m) => {
              const Icon = m.icon
              const selected = accessMode === m.value
              return (
                <Label
                  key={m.value}
                  htmlFor={`mode-${m.value}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition',
                    selected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'hover:bg-accent'
                  )}
                >
                  <RadioGroupItem
                    id={`mode-${m.value}`}
                    value={m.value}
                    className="mt-1"
                  />
                  <Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.description}
                    </p>

                    {selected && m.value === 'WHITELIST' ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">
                            Phone numbers (one per line)
                          </span>
                          <Badge variant="secondary">{whitelistCount} added</Badge>
                        </div>
                        <Textarea
                          aria-label="Whitelisted phone numbers, one per line"
                          value={whitelistText}
                          onChange={(e) => setWhitelistText(e.target.value)}
                          placeholder={
                            '+923001234567\n+923001234568\n+923001234569'
                          }
                          rows={5}
                          className="font-mono text-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : null}

                    {selected && m.value === 'INVITE' ? (
                      <div className="mt-3 space-y-2">
                        <span className="text-xs font-medium">
                          Number of single-use links to generate
                        </span>
                        <Input
                          aria-label="Number of single-use invite links"
                          type="number"
                          min={1}
                          max={500}
                          value={inviteCount}
                          onChange={(e) => setInviteCount(e.target.value)}
                          className="w-32"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <p className="text-xs text-muted-foreground">
                          We&apos;ll generate {Number(inviteCount) || 0}{' '}
                          single-use links on creation.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </Label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Optional code overlay — stacks on any primary mode */}
      <Card>
        <CardHeader>
          <CardTitle>Access code (optional)</CardTitle>
          <CardDescription>
            Add a shared passcode on top of the access mode above. Useful when
            you want everyone to start at the same time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Label
            htmlFor="require-code"
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition hover:bg-accent"
          >
            <Switch
              id="require-code"
              checked={requireCode}
              onCheckedChange={setRequireCode}
            />
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium">Require an access code</span>
              <p className="text-xs text-muted-foreground">
                Participants must enter this code to start.
              </p>
            </div>
          </Label>

          {requireCode ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="access-code" className="text-xs font-medium">
                Access code
              </Label>
              <Input
                id="access-code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="e.g. GK2024"
                className="font-mono uppercase"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Next
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ---- Step 4: Review & Publish ----------------------------------------------

function Step4Review({
  title,
  description,
  imported,
  settings,
  accessMode,
  requireCode,
  accessCode,
  whitelistText,
  inviteCount,
  isPublished,
  setIsPublished,
  creating,
  onCreate,
  onBack,
}: {
  title: string
  description: string
  imported: ParsedQuestion[] | null
  settings: Settings
  accessMode: AccessMode
  requireCode: boolean
  accessCode: string
  whitelistText: string
  inviteCount: string
  isPublished: boolean
  setIsPublished: (v: boolean) => void
  creating: boolean
  onCreate: () => void
  onBack: () => void
}) {
  const questionCount = imported?.length ?? 0
  const whitelistCount = whitelistText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean).length

  const fmtSchedule = () => {
    if (!settings.startTime && !settings.endTime) return 'No schedule'
    const fmt = (v: string) => {
      if (!v) return '—'
      const d = new Date(v)
      return Number.isNaN(d.getTime())
        ? v
        : d.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
    }
    return `${fmt(settings.startTime)} → ${fmt(settings.endTime)}`
  }

  const accessLabel = ACCESS_MODES.find((m) => m.value === accessMode)?.title
  const accessDetail = (() => {
    const base = (() => {
      switch (accessMode) {
        case 'WHITELIST':
          return `${whitelistCount} phone number${whitelistCount === 1 ? '' : 's'} whitelisted`
        case 'INVITE':
          return `${Number(inviteCount) || 0} single-use invite links`
        case 'PUBLIC':
        default:
          return 'Anyone with the link'
      }
    })()
    return requireCode
      ? `${base} + code${accessCode ? `: ${accessCode}` : ' (not set)'}`
      : base
  })()

  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Title', value: title || <span className="text-muted-foreground">Untitled</span> },
    {
      label: 'Description',
      value: description || <span className="text-muted-foreground">—</span>,
    },
    {
      label: 'Questions',
      value: (
        <Badge className="border-transparent bg-emerald-600 text-white">
          {questionCount}
        </Badge>
      ),
    },
    { label: 'Schedule', value: fmtSchedule() },
    {
      label: 'Time limit',
      value: settings.timeLimitMinutes.trim()
        ? `${settings.timeLimitMinutes} min`
        : 'No limit',
    },
    {
      label: 'Marking',
      value: `+${settings.positiveMarks} / −${settings.negativeMarks}`,
    },
    { label: 'Max attempts', value: settings.maxAttempts },
    {
      label: 'Results',
      value: settings.resultReleaseMode === 'IMMEDIATE' ? 'Immediate' : 'Manual',
    },
    {
      label: 'Access',
      value: (
        <span>
          {accessLabel}{' '}
          <span className="text-muted-foreground">· {accessDetail}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Review &amp; publish
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm the details below, then create your test.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>
            Everything looks good? Publish now or save as a draft.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            {rows.map((r) => (
              <div
                key={r.label}
                className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4"
              >
                <dt className="text-sm font-medium text-muted-foreground">
                  {r.label}
                </dt>
                <dd className="text-sm sm:col-span-2">{r.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publish</CardTitle>
          <CardDescription>
            Toggle on to publish immediately. Off saves as a draft.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="publish-switch" className="text-sm font-medium">
                Publish immediately
              </Label>
              <p className="text-xs text-muted-foreground">
                {isPublished
                  ? 'Test will be live and accessible right after creation.'
                  : 'Test will be saved as a draft; you can publish later.'}
              </p>
            </div>
            <Switch
              id="publish-switch"
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={creating}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onCreate}
          disabled={creating || questionCount === 0}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
        >
          {creating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : isPublished ? (
            <>
              <CheckCircle2 className="size-4" />
              Publish test
            </>
          ) : (
            <>
              <FileText className="size-4" />
              Save as draft
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ---- Success screen ---------------------------------------------------------

function SuccessScreen({
  created,
  origin,
  onDashboard,
  onReset,
  onCopy,
}: {
  created: CreatedTest
  origin: string
  onDashboard: () => void
  onReset: () => void
  onCopy: (text: string, msg?: string) => void
}) {
  const testUrl = `${origin}/?t=${created.shareableLink}`
  const inviteLinks = created.inviteLinks ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <CheckCircle2 className="size-8" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Test created!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {created.questionCount} question
          {created.questionCount === 1 ? '' : 's'} ·{' '}
          {created.isPublished ? 'Published' : 'Saved as draft'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="size-4 text-emerald-600" />
            Shareable link
          </CardTitle>
          <CardDescription>
            Send this link to participants.{' '}
            {created.isPublished
              ? 'The test is live.'
              : 'Publish it from the dashboard when ready.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={testUrl}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => onCopy(testUrl, 'Link copied')}
              className="shrink-0"
            >
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      {inviteLinks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="size-4 text-emerald-600" />
              Invitation links
            </CardTitle>
            <CardDescription>
              {inviteLinks.length} single-use link
              {inviteLinks.length === 1 ? '' : 's'} generated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
              {inviteLinks.map((token, i) => {
                const url = `${origin}/?invite=${token}`
                return (
                  <div
                    key={token}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {i + 1}
                    </span>
                    <Input
                      readOnly
                      value={url}
                      className="border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => onCopy(url, 'Invite link copied')}
                      aria-label={`Copy invite link ${i + 1}`}
                      className="shrink-0"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Separator />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onReset}>
          Create another
        </Button>
        <Button
          type="button"
          onClick={onDashboard}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Go to dashboard
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ---- Skeleton ---------------------------------------------------------------

function CreateTestSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Brand />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="mt-3 flex gap-2">
            {STEPS.map((s) => (
              <Skeleton key={s.n} className="h-6 w-28" />
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <div className="flex justify-between">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
