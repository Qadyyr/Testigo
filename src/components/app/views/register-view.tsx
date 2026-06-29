'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Brand } from '../brand'
import { SiteFooter } from '../site-footer'
import { useViewRouter } from '../use-view-router'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type FormValues = z.infer<typeof schema>

export function RegisterView() {
  const { navigate } = useViewRouter()
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  })

  async function onSubmit(values: FormValues) {
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setDone(true)
        toast.success('Registration received. Awaiting approval.')
      } else {
        setFormError(json.message ?? 'Registration failed')
        toast.error(json.message ?? 'Registration failed')
      }
    } catch {
      setFormError('Could not reach the server. Try again.')
      toast.error('Could not reach the server. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Testigo — home"
          >
            <Brand />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        {done ? (
          <Card>
            <CardHeader className="items-center text-center">
              <CheckCircle2 className="size-12 text-amber-600" />
              <CardTitle className="text-xl">Registration received</CardTitle>
              <CardDescription>
                Your account is now pending approval. The platform administrator
                will review your request. You&apos;ll be able to log in once
                approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => navigate('home')}>
                <ArrowLeft className="size-4" />
                Back to home
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <UserPlus className="size-5 text-amber-600" />
                Request admin account
              </CardTitle>
              <CardDescription>
                Register as a teacher/admin. Your account must be approved by
                the platform administrator before you can log in.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
              <CardContent className="flex flex-col gap-4">
                {formError && (
                  <Alert variant="destructive">
                    <AlertTitle>Registration failed</AlertTitle>
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Ahmed Khan"
                    aria-invalid={!!errors.name}
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={!!errors.email}
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    aria-invalid={!!errors.password}
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-600 text-white shadow-sm hover:bg-amber-700"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Registering…
                    </>
                  ) : (
                    'Request account'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => navigate('login')}
            className="text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Already have an account? Sign in
          </Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
