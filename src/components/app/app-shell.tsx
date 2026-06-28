'use client'

import { Suspense } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useViewRouter } from './use-view-router'
import { HomeView } from './views/home-view'
import { LoginView } from './views/login-view'
import { AdminDashboardView } from './views/admin-dashboard-view'
import { CreateTestView } from './views/create-test-view'
import { AnalyticsView } from './views/analytics-view'
import { GradingView } from './views/grading-view'
import { ParticipantTestView } from './views/participant-test-view'

function ViewSwitch() {
  const { view } = useViewRouter()
  const reduceMotion = useReducedMotion()

  let content: React.ReactNode
  switch (view) {
    case 'login':
      content = <LoginView />
      break
    case 'admin':
      content = <AdminDashboardView />
      break
    case 'create':
      content = <CreateTestView />
      break
    case 'analytics':
      content = <AnalyticsView />
      break
    case 'grading':
      content = <GradingView />
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
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        }
      >
        <ViewSwitch />
      </Suspense>
    </div>
  )
}
