'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  BarChart3,
  Clock,
  Copy,
  Database as DatabaseIcon,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Plus,
  Rocket,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  TrendingUp,
  Users,
  UserCheck,
  UserX,
  ShieldCheck,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

// ---- API contracts (mirror Task 1's /api/admin/stats) ----------------------

interface RecentTest {
  id: string
  title: string
  isPublished: boolean
  accessMode: 'PUBLIC' | 'WHITELIST' | 'INVITE'
  createdAt: string
  attempts: number
}

interface AdminStats {
  totalTests: number
  publishedTests: number
  totalAttempts: number
  avgScore: number | null
  recentTests: RecentTest[]
}

interface ApiResponse<T> {
  success: boolean
  message?: string
  data?: T
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: AdminStats }

// ---- Shared bits -----------------------------------------------------------

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

function accessModeLabel(mode: RecentTest['accessMode']): string {
  switch (mode) {
    case 'PUBLIC':
      return 'Public'
    case 'WHITELIST':
      return 'Whitelist'
    case 'INVITE':
      return 'Invite'
  }
}

function accessBadgeClass(mode: RecentTest['accessMode']): string {
  switch (mode) {
    case 'PUBLIC':
      return 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'WHITELIST':
      return 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'INVITE':
      return 'border-transparent bg-secondary text-secondary-foreground'
  }
}

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy')
  } catch {
    return iso
  }
}

type NavIcon = React.ComponentType<{ className?: string }>

function NavItem({
  icon: Icon,
  label,
  active,
  disabled,
  comingSoon,
  onClick,
}: {
  icon: NavIcon
  label: string
  active?: boolean
  disabled?: boolean
  comingSoon?: string
  onClick?: () => void
}) {
  const baseClass = [
    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
  ].join(' ')

  const content = (
    <>
      <Icon className="size-4" />
      <span className="flex-1 text-left">{label}</span>
      {disabled && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Soon
        </span>
      )}
    </>
  )

  if (disabled) {
    const inner = (
      <div
        className={baseClass}
        aria-disabled="true"
        role="button"
        tabIndex={0}
      >
        {content}
      </div>
    )
    if (comingSoon) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent>{comingSoon}</TooltipContent>
        </Tooltip>
      )
    }
    return inner
  }

  return (
    <button type="button" onClick={onClick} className={baseClass}>
      {content}
    </button>
  )
}

type AdminSection = 'dashboard' | 'tests' | 'analytics' | 'settings' | 'admins' | 'database'

function SidebarNav({
  section,
  onSection,
  onNavigate,
  isSuperAdmin,
}: {
  section: AdminSection
  onSection: (s: AdminSection) => void
  onNavigate?: () => void
  isSuperAdmin: boolean
}) {
  const items: { icon: NavIcon; label: string; key: AdminSection }[] = [
    { icon: LayoutDashboard, label: 'Dashboard', key: 'dashboard' },
    { icon: FileText, label: 'Tests', key: 'tests' },
    { icon: BarChart3, label: 'Analytics', key: 'analytics' },
    { icon: SettingsIcon, label: 'Settings', key: 'settings' },
  ]
  const superItems: { icon: NavIcon; label: string; key: AdminSection }[] = [
    { icon: Users, label: 'Admins', key: 'admins' },
    { icon: DatabaseIcon, label: 'Database', key: 'database' },
  ]
  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {items.map((item) => (
        <NavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          active={section === item.key}
          onClick={() => {
            onSection(item.key)
            onNavigate?.()
          }}
        />
      ))}
      {isSuperAdmin && (
        <>
          <div className="my-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Super Admin
          </div>
          {superItems.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={section === item.key}
              onClick={() => {
                onSection(item.key)
                onNavigate?.()
              }}
            />
          ))}
        </>
      )}
    </nav>
  )
}

// ---- Content states --------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: NavIcon
  label: string
  value: string
  loading?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <span className="flex size-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <Icon className="size-4" />
          </span>
        </div>
        <CardTitle className="text-2xl tabular-nums">
          {loading ? <Skeleton className="h-7 w-16" /> : value}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
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
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <p className="text-sm font-medium text-destructive">
        Couldn&apos;t load your tests
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

function EmptyTestsState() {
  const { navigate } = useViewRouter()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <FileText className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">No tests yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Create your first test to start collecting responses.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('create')}
        className="border-amber-600 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
      >
        <Plus className="size-4" />
        Create Test
      </Button>
    </div>
  )
}

function RecentTestsTable({ tests }: { tests: RecentTest[] }) {
  const { navigate } = useViewRouter()
  return (
    <div className="max-h-96 overflow-y-auto rounded-md border [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/40">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Attempts</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tests.map((test) => (
            <TableRow
              key={test.id}
              onClick={() => navigate('analytics', { id: test.id })}
              className="cursor-pointer transition-colors hover:bg-accent/50"
            >
              <TableCell className="font-medium">{test.title}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={accessBadgeClass(test.accessMode)}
                >
                  {accessModeLabel(test.accessMode)}
                </Badge>
              </TableCell>
              <TableCell>
                {test.isPublished ? (
                  <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    Published
                  </Badge>
                ) : (
                  <Badge variant="secondary">Draft</Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {test.attempts}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(test.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DashboardContent({
  loadState,
  onRetry,
}: {
  loadState: LoadState
  onRetry: () => void
}) {
  const { navigate } = useViewRouter()
  const loading = loadState.status === 'loading'
  const error = loadState.status === 'error' ? loadState.message : null
  const data = loadState.status === 'ok' ? loadState.data : null

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Total Tests"
          value={data ? String(data.totalTests) : '—'}
          loading={loading}
        />
        <StatCard
          icon={Rocket}
          label="Published"
          value={data ? String(data.publishedTests) : '—'}
          loading={loading}
        />
        <StatCard
          icon={Users}
          label="Total Attempts"
          value={data ? String(data.totalAttempts) : '—'}
          loading={loading}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Score"
          value={
            data
              ? data.avgScore === null
                ? '—'
                : `${Math.round(data.avgScore)}%`
              : '—'
          }
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Tests</CardTitle>
          <CardDescription>
            Recently created tests on your account.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('create')}
              className="border-amber-600 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
            >
              <Plus className="size-4" />
              Create Test
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState message={error} onRetry={onRetry} />
          ) : loading ? (
            <TableSkeleton />
          ) : data && data.recentTests.length > 0 ? (
            <RecentTestsTable tests={data.recentTests} />
          ) : (
            <EmptyTestsState />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Layout shells ---------------------------------------------------------

function AdminSkeletonShell() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
          <div className="flex h-14 items-center border-b px-4">
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="size-8 rounded-full" />
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="mt-6 h-64 w-full rounded-xl" />
          </main>
          <SiteFooter />
        </div>
      </div>
    </div>
  )
}

function AdminLayout({
  userEmail,
  initials,
  onSignOut,
  mobileNavOpen,
  setMobileNavOpen,
  section,
  onSection,
  pageTitle,
  isSuperAdmin,
  children,
}: {
  userEmail: string
  initials: string
  onSignOut: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  section: AdminSection
  onSection: (s: AdminSection) => void
  pageTitle: string
  isSuperAdmin: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background md:flex">
          <div className="flex h-14 shrink-0 items-center border-b px-4">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav section={section} onSection={onSection} isSuperAdmin={isSuperAdmin} />
          </div>
          <div className="shrink-0 border-t p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              className="w-full justify-start text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
            <div className="flex items-center gap-2">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 gap-0 p-0">
                  <SheetHeader className="flex h-14 flex-row items-center border-b px-4">
                    <SheetTitle className="text-left">
                      <Brand />
                    </SheetTitle>
                  </SheetHeader>
                  <SidebarNav
                    section={section}
                    onSection={onSection}
                    onNavigate={() => setMobileNavOpen(false)}
                    isSuperAdmin={isSuperAdmin}
                  />
                  <div className="mt-auto border-t p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMobileNavOpen(false)
                        onSignOut()
                      }}
                      className="w-full justify-start text-muted-foreground hover:text-foreground"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <h1 className="text-base font-semibold sm:text-lg">{pageTitle}</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    aria-label="Account menu"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-amber-600 text-xs font-semibold text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="text-xs font-normal text-muted-foreground">
                      Signed in as
                    </span>
                    <span className="truncate text-sm">
                      {userEmail || 'Admin'}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onSignOut}>
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

          <SiteFooter />
        </div>
      </div>
    </div>
  )
}

// ---- Main view -------------------------------------------------------------

export function AdminDashboardView() {
  const { data: session, status } = useSession()
  const { navigate } = useViewRouter()
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [section, setSection] = useState<AdminSection>('dashboard')

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const getRole = () =>
    (session?.user as { role?: string } | undefined)?.role

  // Auth guard: redirect unauthenticated / non-admin users to login.
  useEffect(() => {
    if (status === 'loading') return
    if (
      status === 'unauthenticated' ||
      (getRole() !== 'ADMIN' && getRole() !== 'SUPER_ADMIN')
    ) {
      navigateRef.current('login')
    }
  }, [status, session])

  // Fetch dashboard stats once authenticated as an admin.
  useEffect(() => {
    if (
      status !== 'authenticated' ||
      (getRole() !== 'ADMIN' && getRole() !== 'SUPER_ADMIN')
    )
      return
    let cancelled = false
    setLoadState({ status: 'loading' })

    async function load() {
      try {
        const res = await fetch('/api/admin/stats', { credentials: 'include' })
        if (cancelled) return
        if (res.status === 401) {
          navigateRef.current('login')
          return
        }
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`)
        }
        const json: ApiResponse<AdminStats> = await res.json()
        if (cancelled) return
        if (json.success && json.data) {
          setLoadState({ status: 'ok', data: json.data })
        } else {
          throw new Error(json.message || 'Failed to load dashboard data')
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
  }, [status, session, retryKey])

  const handleSignOut = useCallback(async () => {
    await signOut({ redirect: false })
    toast.success('Signed out.')
    navigate('home')
  }, [navigate])

  if (status === 'loading') {
    return <AdminSkeletonShell />
  }

  if (
    status !== 'authenticated' ||
    (getRole() !== 'ADMIN' && getRole() !== 'SUPER_ADMIN')
  ) {
    return <AdminSkeletonShell />
  }

  const userEmail = session?.user?.email ?? ''
  const initials = userEmail ? userEmail.charAt(0).toUpperCase() : 'A'
  const pageTitle =
    section === 'dashboard' ? 'Dashboard'
    : section === 'tests' ? 'Tests'
    : section === 'analytics' ? 'Analytics'
    : section === 'admins' ? 'Admins'
    : section === 'database' ? 'Database'
    : 'Settings'

  const isSuperAdmin = getRole() === 'SUPER_ADMIN'

  return (
    <AdminLayout
      userEmail={userEmail}
      initials={initials}
      onSignOut={handleSignOut}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
      section={section}
      onSection={setSection}
      pageTitle={pageTitle}
      isSuperAdmin={isSuperAdmin}
    >
      {section === 'dashboard' && (
        <DashboardContent
          loadState={loadState}
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      )}
      {section === 'tests' && <TestsContent navigate={navigate} isSuperAdmin={isSuperAdmin} />}
      {section === 'analytics' && <AnalyticsOverviewContent navigate={navigate} />}
      {section === 'settings' && <SettingsContent />}
      {section === 'admins' && isSuperAdmin && <AdminsContent />}
      {section === 'database' && isSuperAdmin && <DatabaseContent />}
    </AdminLayout>
  )
}

// ---- Tests management section ----------------------------------------------

interface TestItem {
  id: string
  title: string
  description: string | null
  accessMode: 'PUBLIC' | 'WHITELIST' | 'INVITE'
  requireCode: boolean
  accessCode: string | null
  isPublished: boolean
  timeLimitMinutes: number | null
  resultReleaseMode: 'IMMEDIATE' | 'MANUAL' | 'NEVER'
  createdAt: string
  shareableLink: string
  ownerName?: string
  ownerEmail?: string
  attemptCount: number
  questionCount: number
}
interface TestsResponse { success: boolean; data?: TestItem[]; message?: string }

function TestsContent({ navigate, isSuperAdmin }: { navigate: (view?: string, extra?: Record<string, string>) => void; isSuperAdmin?: boolean }) {
  const [tests, setTests] = useState<TestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/tests', { credentials: 'include' })
      if (res.status === 401) { navigate('login'); return }
      const json: TestsResponse = await res.json()
      if (json.success && json.data) setTests(json.data)
      else throw new Error(json.message ?? 'Failed to load tests')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function handleTogglePublish(test: TestItem) {
    const newPublished = !test.isPublished
    try {
      const res = await fetch(`/api/admin/tests/${test.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isPublished: newPublished }),
      })
      if (res.ok) {
        toast.success(newPublished ? 'Test published' : 'Test unpublished')
        setTests((ts) => ts.map((t) => t.id === test.id ? { ...t, isPublished: newPublished } : t))
      } else {
        toast.error('Could not update test')
      }
    } catch {
      toast.error('Network error')
    }
  }

  async function handleDelete(test: TestItem) {
    setDeleting(test.id)
    try {
      const res = await fetch(`/api/admin/tests/${test.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        toast.success('Test deleted')
        setTests((ts) => ts.filter((t) => t.id !== test.id))
      } else {
        toast.error('Could not delete test')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(null)
    }
  }

  function copyLink(link: string) {
    const url = `${window.location.origin}/?t=${link}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied')
  }

  const filtered = tests.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex flex-col gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tests…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => navigate('create')} className="bg-amber-600 text-white hover:bg-amber-700">
          <Plus className="size-4" /> Create Test
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="size-10 text-muted-foreground" />
            <p className="text-sm font-medium">{search ? 'No tests match your search' : 'No tests yet'}</p>
            <p className="text-xs text-muted-foreground">
              {search ? 'Try a different search term.' : 'Create your first test to get started.'}
            </p>
            {!search && (
              <Button onClick={() => navigate('create')} className="bg-amber-600 text-white hover:bg-amber-700">
                <Plus className="size-4" /> Create Test
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate('analytics', { id: t.id })}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{t.title}</h3>
                    {t.isPublished ? (
                      <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                    <Badge variant="outline" className={accessBadgeClass(t.accessMode)}>
                      {accessModeLabel(t.accessMode)}
                    </Badge>
                    {t.accessCode && (
                      <Badge variant="outline" className="font-mono text-xs">{t.accessCode}</Badge>
                    )}
                    {isSuperAdmin && t.ownerName && (
                      <Badge variant="outline" className="text-xs">
                        <Users className="size-2.5" /> {t.ownerName}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {t.description || 'No description'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{t.questionCount} questions</span>
                    <span>{t.attemptCount} attempts</span>
                    {t.timeLimitMinutes && <span>{t.timeLimitMinutes} min</span>}
                    <span>{formatDate(t.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => copyLink(t.shareableLink)} aria-label="Copy link">
                        <Copy className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy test link</TooltipContent>
                  </Tooltip>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTogglePublish(t)}
                  >
                    {t.isPublished ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('analytics', { id: t.id })}
                  >
                    <BarChart3 className="size-4" />
                    <span className="hidden sm:inline">Analytics</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" disabled={deleting === t.id}>
                        {deleting === t.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{t.title}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the test, its questions, and all {t.attemptCount} attempt(s).
                          This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(t)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Analytics overview section --------------------------------------------

function AnalyticsOverviewContent({ navigate }: { navigate: (view?: string, extra?: Record<string, string>) => void }) {
  const [tests, setTests] = useState<TestItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/tests', { credentials: 'include' })
        if (res.status === 401) { navigate('login'); return }
        const json: TestsResponse = await res.json()
        if (json.success && json.data) setTests(json.data)
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>

  const published = tests.filter((t) => t.isPublished)
  const totalAttempts = tests.reduce((s, t) => s + t.attemptCount, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tests</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              {tests.length}<FileText className="size-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Published</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              {published.length}<Rocket className="size-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Attempts</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              {totalAttempts}<Users className="size-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Attempts/Test</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              {tests.length > 0 ? Math.round(totalAttempts / tests.length) : 0}<TrendingUp className="size-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-test breakdown</CardTitle>
          <CardDescription>Click any test to see detailed analytics, scores, and difficulty</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {tests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No tests yet. Create one to see analytics.</p>
          ) : (
            tests.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate('analytics', { id: t.id })}
                className="flex items-center justify-between rounded-lg border p-3 text-left transition hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    <Badge variant="outline" className={accessBadgeClass(t.accessMode)}>
                      {accessModeLabel(t.accessMode)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.questionCount} questions · {t.attemptCount} attempts
                  </p>
                </div>
                <BarChart3 className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Settings section ------------------------------------------------------

function SettingsContent() {
  const [current, setCurrent] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (newPass !== confirm) {
      toast.error('New passwords do not match')
      return
    }
    if (newPass.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Password updated')
        setCurrent('')
        setNewPass('')
        setConfirm('')
      } else {
        toast.error(json.message ?? 'Could not update password')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SettingsIcon className="size-4 text-amber-600" />
            Change password
          </CardTitle>
          <CardDescription>Update your admin account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current" className="text-xs">Current password</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new" className="text-xs">New password</Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm" className="text-xs">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <Button type="submit" disabled={saving} className="bg-amber-600 text-white hover:bg-amber-700">
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Admins management (Super Admin only) -----------------------------------

interface AdminItem {
  id: string
  email: string
  name: string | null
  role: string
  status: string
  createdAt: string
}
interface AdminsResponse { success: boolean; data?: AdminItem[]; message?: string }

function AdminsContent() {
  const [admins, setAdmins] = useState<AdminItem[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  // Create-admin form state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/admins', { credentials: 'include' })
      const json: AdminsResponse = await res.json()
      if (json.success && json.data) setAdmins(json.data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error('Fill in all fields')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim(), password: newPassword }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Admin account created')
        setNewName(''); setNewEmail(''); setNewPassword('')
        setShowCreate(false)
        load()
      } else {
        toast.error(json.message ?? 'Could not create account')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setCreating(false)
    }
  }

  async function handleAction(id: string, action: 'approve' | 'reject' | 'promote' | 'demote' | 'delete') {
    setActing(id + action)
    try {
      const res = await fetch(`/api/admin/admins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success(json.message)
        if (action === 'delete') {
          setAdmins((a) => a.filter((x) => x.id !== id))
        } else {
          load()
        }
      } else {
        toast.error(json.message ?? 'Action failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setActing(null)
    }
  }

  if (loading) return <div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>

  const pending = admins.filter((a) => a.status === 'PENDING')
  const approved = admins.filter((a) => a.status === 'APPROVED')

  return (
    <div className="flex flex-col gap-6">
      {/* Add admin button / form */}
      <div className="flex justify-end">
        {showCreate ? (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-base">Create admin account</CardTitle>
              <CardDescription>The account will be immediately approved and can log in.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="flex flex-col gap-1.5 sm:flex-1">
                  <Label htmlFor="new-name" className="text-xs">Name</Label>
                  <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" disabled={creating} />
                </div>
                <div className="flex flex-col gap-1.5 sm:flex-1">
                  <Label htmlFor="new-email" className="text-xs">Email</Label>
                  <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" disabled={creating} />
                </div>
                <div className="flex flex-col gap-1.5 sm:flex-1">
                  <Label htmlFor="new-pass" className="text-xs">Password</Label>
                  <Input id="new-pass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 chars" disabled={creating} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={creating} className="bg-amber-600 text-white hover:bg-amber-700">
                    {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Create
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowCreate(true)} className="bg-amber-600 text-white hover:bg-amber-700">
            <Plus className="size-4" /> Add admin
          </Button>
        )}
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-amber-600" />
              Pending requests ({pending.length})
            </CardTitle>
            <CardDescription>Review and approve or reject account requests</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Requested {formatDate(a.createdAt)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAction(a.id, 'approve')}
                    disabled={!!acting}
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {acting === a.id + 'approve' ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(a.id, 'reject')}
                    disabled={!!acting}
                  >
                    {acting === a.id + 'reject' ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All admins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All admin accounts</CardTitle>
          <CardDescription>{approved.length} approved · {pending.length} pending</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {admins.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{a.name}</p>
                  {a.role === 'SUPER_ADMIN' && (
                    <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      <ShieldCheck className="size-3" /> Super Admin
                    </Badge>
                  )}
                  {a.status === 'PENDING' && (
                    <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">Pending</Badge>
                  )}
                  {a.status === 'REJECTED' && (
                    <Badge variant="destructive">Rejected</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{a.email}</p>
              </div>
              {a.status === 'APPROVED' && a.role !== 'SUPER_ADMIN' && (
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => handleAction(a.id, 'promote')} disabled={!!acting}>
                    Promote
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleAction(a.id, 'delete')} disabled={!!acting}>
                    {acting === a.id + 'delete' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </div>
              )}
              {a.status === 'APPROVED' && a.role === 'SUPER_ADMIN' && (
                <Badge variant="outline" className="shrink-0 gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3" /> Locked
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Database usage (Super Admin only) -------------------------------------

interface DbUsage {
  usedBytes: number
  limitBytes: number
  percentage: number
  usedMB: number
  limitMB: number
}
interface DbUsageResponse { success: boolean; data?: DbUsage; message?: string }

function DatabaseContent() {
  const [usage, setUsage] = useState<DbUsage | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/database-usage', { credentials: 'include' })
      const json: DbUsageResponse = await res.json()
      if (json.success && json.data) setUsage(json.data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  if (loading || !usage) return <div className="flex flex-col gap-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>

  const color = usage.percentage < 70 ? 'bg-amber-500' : usage.percentage < 90 ? 'bg-amber-500' : 'bg-destructive'

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseIcon className="size-4 text-amber-600" />
            Database usage
          </CardTitle>
          <CardDescription>Real-time PostgreSQL storage on Neon (free tier)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold tabular-nums">{usage.percentage}%</span>
              <span className="ml-2 text-sm text-muted-foreground">used</span>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p className="font-mono">{usage.usedMB} MB / {usage.limitMB} MB</p>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(usage.percentage, 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Neon free tier includes 512 MB of storage. The database auto-pauses when idle
            (resumes in ~1s on first request). Data includes tests, questions, attempts,
            responses, and all admin/participant records.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}