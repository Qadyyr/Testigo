'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react'
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
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

export function LoginView() {
  const { navigate } = useViewRouter()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: FormValues) {
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      })
      if (res?.ok) {
        toast.success('Signed in. Taking you to the dashboard…')
        navigate('admin')
      } else {
        const message = 'Invalid email or password.'
        setFormError(message)
        toast.error(message)
      }
    } catch {
      const message = 'Could not reach the sign-in service. Try again.'
      setFormError(message)
      toast.error(message)
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
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-xl">Admin sign in</CardTitle>
            <CardDescription>
              Authenticate to manage tests, scheduling, and results.
            </CardDescription>
          </CardHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            <CardContent className="flex flex-col gap-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertTitle>Sign-in failed</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

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
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="mt-4 rounded-lg border border-dashed bg-muted/40 p-4">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 size-4 text-muted-foreground" />
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Demo credentials
              </span>
              <span>
                Email:{' '}
                <code className="rounded bg-muted px-1 py-0.5">
                  admin@testigo.test
                </code>
              </span>
              <span>
                Password:{' '}
                <code className="rounded bg-muted px-1 py-0.5">
                  admin1234
                </code>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => navigate('home')}
            className="text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
