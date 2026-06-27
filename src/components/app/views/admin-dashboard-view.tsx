'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Rocket,
  Settings as SettingsIcon,
  Sun,
  TrendingUp,
  Users,
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
  accessMode: 'PUBLIC' | 'CODE' | 'WHITELIST'
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
    case 'CODE':
      return 'Code'
    case 'WHITELIST':
      return 'Whitelist'
  }
}

function accessBadgeClass(mode: RecentTest['accessMode']): string {
  switch (mode) {
    case 'PUBLIC':
      return 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'CODE':
      return 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'WHITELIST':
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
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
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

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      <NavItem
        icon={LayoutDashboard}
        label="Dashboard"
        active
        onClick={onNavigate}
      />
      <NavItem
        icon={FileText}
        label="Tests"
        disabled
        comingSoon="Tests management arrives in Phase 2"
      />
      <NavItem
        icon={BarChart3}
        label="Analytics"
        disabled
        comingSoon="Analytics arrives in Phase 5"
      />
      <NavItem
        icon={SettingsIcon}
        label="Settings"
        disabled
        comingSoon="Settings arrives in a later phase"
      />
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
          <span className="flex size-8 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
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
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
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
        onClick={() => toast.message('Test creation wizard arrives in Phase 2.')}
        className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
      >
        <Plus className="size-4" />
        Create Test
      </Button>
    </div>
  )
}

function RecentTestsTable({ tests }: { tests: RecentTest[] }) {
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
            <TableRow key={test.id}>
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
                  <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
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
              onClick={() =>
                toast.message('Test creation wizard arrives in Phase 2.')
              }
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
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
  children,
}: {
  userEmail: string
  initials: string
  onSignOut: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
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
            <SidebarNav />
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
                  <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
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
              <h1 className="text-base font-semibold sm:text-lg">Dashboard</h1>
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
                      <AvatarFallback className="bg-emerald-600 text-xs font-semibold text-white">
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

  return (
    <AdminLayout
      userEmail={userEmail}
      initials={initials}
      onSignOut={handleSignOut}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
    >
      <DashboardContent
        loadState={loadState}
        onRetry={() => setRetryKey((k) => k + 1)}
      />
    </AdminLayout>
  )
}
