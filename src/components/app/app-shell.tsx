'use client'

import { Suspense } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'
import { useViewRouter } from './use-view-router'
import { HomeView } from './views/home-view'
import { LoginView } from './views/login-view'
import { RegisterView } from './views/register-view'
import { AdminDashboardView } from './views/admin-dashboard-view'
import { CreateTestView } from './views/create-test-view'
import { EditTestView } from './views/edit-test-view'
import { AnalyticsView } from './views/analytics-view'
import { GradingView } from './views/grading-view'
import { ResultsView } from './views/results-view'
import { ParticipantTestView } from './views/participant-test-view'

function ViewSwitch() {
  const { view } = useViewRouter()
  const reduceMotion = useReducedMotion()

  let content: React.ReactNode
  switch (view) {
    case 'login':
      content = <LoginView />
      break
    case 'register':
      content = <RegisterView />
      break
    case 'admin':
      content = <AdminDashboardView />
      break
    case 'create':
      content = <CreateTestView />
      break
    case 'edit':
      content = <EditTestView />
      break
    case 'analytics':
      content = <AnalyticsView />
      break
    case 'grading':
      content = <GradingView />
      break
    case 'results':
      content = <ResultsView />
      break
    case 'test':
      content = <ParticipantTestView />
      break
    case 'home':
    default:
      content = <HomeView />
      break
  }

  return (
    <motion.div
      key={view}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex flex-1 flex-col"
    >
      {content}
    </motion.div>
  )
}

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* useSearchParams requires a Suspense boundary in Next 16. */}
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
            <div className="flex flex-col gap-6">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-5 w-96 max-w-full" />
              <div className="mt-4 max-w-md">
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            </div>
          </div>
        }
      >
        <ViewSwitch />
      </Suspense>
    </div>
  )
}
