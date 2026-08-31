import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AudioLines, Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/kibo-ui/spinner'
import { useAppName, useAuthStore } from '@/stores/auth'

export function LoginPage() {
  const location = useLocation()
  const appName = useAppName()
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Reset the busy state if a restore elsewhere resolves the session for us.
  useEffect(() => {
    if (status === 'authenticated') setSubmitting(false)
  }, [status])

  if (status === 'authenticated') {
    const from = (location.state as { from?: Location } | null)?.from?.pathname
    return <Navigate to={from && from !== '/signin' ? from : '/'} replace />
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    await login(username.trim(), password)
    setSubmitting(false)
  }

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-6">
      {/* Ambient wash — keeps the sign-in screen from reading as a bare form
          without adding anything the user has to look past. */}
      <div aria-hidden className="pointer-events-none absolute -top-1/3 left-1/2 size-[70rem] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-1/2 right-0 size-[45rem] rounded-full bg-playing/8 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <AudioLines className="size-7" strokeWidth={2.25} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{appName}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your library</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-card/60 p-6 shadow-xl shadow-black/5 backdrop-blur-sm">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="username" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} disabled={submitting} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="pr-10" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} required />
              <Button type="button" variant="ghost" size="icon" tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Spinner variant="ring" size={16} />
                Signing in
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
