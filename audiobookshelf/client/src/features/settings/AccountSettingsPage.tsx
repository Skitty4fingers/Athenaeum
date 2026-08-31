import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, SlidersHorizontal } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useChangePassword } from '@/hooks/use-account'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/kibo-ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const SPEEDS = [0.75, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const JUMP_AMOUNTS = [5, 10, 15, 30, 45, 60]

function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const changePassword = useChangePassword()

  const mismatch = confirm.length > 0 && next !== confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!current || !next || next !== confirm) return
    try {
      await changePassword.mutateAsync({ password: current, newPassword: next })
      toast.success('Password changed')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change your password')
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Password</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Changing your password signs you out on every other device.</p>

      <form onSubmit={submit} className="mt-4 max-w-sm space-y-2.5">
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input id="current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={changePassword.isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} disabled={changePassword.isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={changePassword.isPending} aria-invalid={mismatch} />
          {mismatch && <p className="text-xs text-destructive">Passwords don't match</p>}
        </div>
        <Button type="submit" disabled={!current || !next || next !== confirm || changePassword.isPending} className="gap-1.5">
          {changePassword.isPending && <Spinner variant="ring" size={14} />}
          Change password
        </Button>
      </form>
    </section>
  )
}

function PlaybackSection() {
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const setRate = usePlayerStore((s) => s.setRate)
  const jumpBackwardAmount = usePlayerStore((s) => s.jumpBackwardAmount)
  const setJumpBackwardAmount = usePlayerStore((s) => s.setJumpBackwardAmount)
  const jumpForwardAmount = usePlayerStore((s) => s.jumpForwardAmount)
  const setJumpForwardAmount = usePlayerStore((s) => s.setJumpForwardAmount)

  return (
    <section className="mt-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Playback</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Saved on this device only — audiobookshelf doesn't sync playback preferences across devices, so these live in this browser's storage, the same as upstream.
      </p>

      <div className="mt-4 grid max-w-sm gap-2.5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="default-speed">Default speed</Label>
          <Select value={String(playbackRate)} onValueChange={(v) => setRate(Number(v))}>
            <SelectTrigger id="default-speed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEEDS.map((speed) => (
                <SelectItem key={speed} value={String(speed)}>
                  {speed}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jump-back">Back button</Label>
          <Select value={String(jumpBackwardAmount)} onValueChange={(v) => setJumpBackwardAmount(Number(v))}>
            <SelectTrigger id="jump-back">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUMP_AMOUNTS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {seconds}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jump-forward">Forward button</Label>
          <Select value={String(jumpForwardAmount)} onValueChange={(v) => setJumpForwardAmount(Number(v))}>
            <SelectTrigger id="jump-forward">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUMP_AMOUNTS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {seconds}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  )
}

export function AccountSettingsPage() {
  const user = useAuthStore((s) => s.user)
  const isGuest = user?.type === 'guest'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {user?.username}</p>
      </div>

      {isGuest ? <p className="text-sm text-muted-foreground">Guest accounts don't have a password to change.</p> : <PasswordSection />}
      <PlaybackSection />
    </div>
  )
}
