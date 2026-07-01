'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Download, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

interface StudentAttempt {
  id: string
  name: string
  identifier: string
  score: number
  obtainedMarks?: number
  maxMarks?: number
  status: string
  startedAt: string
  submittedAt: string | null
  durationSeconds: number | null
  durationLabel: string
  questionsAttempted: number
  questionsTotal: number
}
interface ResultsResponse {
  success: boolean
  data?: {
    test: { id: string; title: string }
    questionsTotal: number
    attempts: StudentAttempt[]
    totalCount: number
    hasMore?: boolean
  }
  message?: string
}

const PAGE_SIZE = 25

export function ResultsView() {
  const { params, navigate } = useViewRouter()
  const testId = params.get('id') ?? ''
  const { data: session, status } = useSession()
  const [attempts, setAttempts] = useState<StudentAttempt[]>([])
  const [testTitle, setTestTitle] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
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
        const offset = page * PAGE_SIZE
        const res = await fetch(
          `/api/admin/tests/${encodeURIComponent(testId)}/results?limit=${PAGE_SIZE}&offset=${offset}`,
          { credentials: 'include' }
        )
        if (cancelled) return
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json: ResultsResponse = await res.json()
        if (cancelled) return
        if (json.success && json.data) {
          setAttempts(json.data.attempts)
          setTotalCount(json.data.totalCount)
          setTestTitle(json.data.test.title)
        } else {
          throw new Error(json.message ?? 'Failed to load results')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [testId, page])

  async function handleExportCsv() {
    try {
      const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/results?format=csv`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Export failed')
      const csv = await res.text()
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${testTitle.replace(/[^a-z0-9]/gi, '_') || 'test'}_results.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported')
    } catch {
      toast.error('Could not export CSV')
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const filtered = search
    ? attempts.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.identifier.toLowerCase().includes(search.toLowerCase())
      )
    : attempts

  if (loading && attempts.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center border-b px-4 sm:px-6">
          <Skeleton className="h-5 w-32" />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm font-medium text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('analytics', { id: testId })}>
          Back to analytics
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('analytics', { id: testId })}>
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Analytics</span>
          </Button>
          <span className="text-sm font-semibold">{testTitle || 'Results'}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={totalCount === 0}>
          <Download className="size-4" />
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {totalCount} student{totalCount === 1 ? '' : 's'} total
          </p>
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {search ? 'No students match your search.' : 'No students have taken this test yet.'}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">Questions</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Started</th>
                      <th className="px-4 py-3 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-accent/30">
                        <td className="px-4 py-3">
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{a.identifier}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold tabular-nums ${a.score >= 50 ? 'text-amber-600' : 'text-destructive'}`}>
                            {a.score}%
                          </span>
                          {a.obtainedMarks != null && a.maxMarks != null && a.maxMarks > 0 && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {a.obtainedMarks}/{a.maxMarks}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {a.questionsAttempted}/{a.questionsTotal}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {a.durationLabel}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(a.startedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {a.submittedAt
                            ? new Date(a.submittedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="flex flex-col gap-2 p-3 sm:hidden">
                {filtered.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.identifier}</p>
                      </div>
                      <span className={`font-semibold tabular-nums ${a.score >= 50 ? 'text-amber-600' : 'text-destructive'}`}>
                        {a.score}%
                        {a.obtainedMarks != null && a.maxMarks != null && a.maxMarks > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {a.obtainedMarks}/{a.maxMarks} marks
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Q: {a.questionsAttempted}/{a.questionsTotal}</span>
                      <span>Time: {a.durationLabel}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(a.startedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && !search && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                <ArrowLeft className="size-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
