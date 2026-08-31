import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, Plus, Trash2, Users as UsersIcon } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { useUsers, useCreateUser, useResetPassword, useDeleteUser, type CreateUserInput } from '@/hooks/use-users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/kibo-ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import type { User } from '@/types/abs'

function formatLastSeen(ms: number | null): string {
  if (!ms) return 'Never signed in'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function AddUserForm({ onAdd, isPending }: { onAdd: (input: CreateUserInput) => void; isPending: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [type, setType] = useState<CreateUserInput['type']>('user')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    onAdd({ username: username.trim(), password, type })
    setUsername('')
    setPassword('')
    setType('user')
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-user-username">Username</Label>
          <Input id="new-user-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. jamie" disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-user-password">Password</Label>
          <Input id="new-user-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="A starting password" disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-user-type">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as CreateUserInput['type'])}>
            <SelectTrigger id="new-user-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={!username.trim() || !password || isPending} className="gap-1.5">
        {isPending ? <Spinner variant="ring" size={14} /> : <Plus className="size-4" />}
        Add user
      </Button>
    </form>
  )
}

function ResetPasswordDialog({ user }: { user: User }) {
  const [password, setPassword] = useState('')
  const [open, setOpen] = useState(false)
  const resetPassword = useResetPassword(user.id)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    try {
      await resetPassword.mutateAsync(password)
      toast.success(`Password reset for ${user.username}`)
      setPassword('')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reset that password')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setPassword('') }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label={`Reset password for ${user.username}`}>
          <KeyRound className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Sets a new password for <span className="font-medium text-foreground">{user.username}</span> and signs them out everywhere. Share the new password with them directly.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-1.5">
          <Label htmlFor="reset-password-value">New password</Label>
          <Input id="reset-password-value" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} disabled={resetPassword.isPending} />
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={!password || resetPassword.isPending} className="gap-1.5">
              {resetPassword.isPending && <Spinner variant="ring" size={14} />}
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage() {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { data: users, isPending } = useUsers()
  const createUser = useCreateUser()
  const deleteUser = useDeleteUser()

  async function handleAddUser(input: CreateUserInput) {
    try {
      await createUser.mutateAsync(input)
      toast.success('User added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that user')
    }
  }

  async function handleDeleteUser(user: User) {
    try {
      await deleteUser.mutateAsync(user.id)
      toast.success(`${user.username} removed`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that user')
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6 flex items-center gap-2.5">
        <UsersIcon className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">User management</h1>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-medium">Everyone with access</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add or remove accounts, or reset a password. Fine-grained permissions aren't editable here — everyone gets their type's defaults.</p>

        {isPending ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {users?.map((user) => {
              const isSelf = user.id === currentUserId
              const isRoot = user.type === 'root'
              return (
                <li key={user.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{user.username}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{user.type}</span>
                      {isSelf && <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary">You</span>}
                      {!user.isActive && <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-destructive">Disabled</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{formatLastSeen(user.lastSeen)}</p>
                  </div>
                  <ResetPasswordDialog user={user} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${user.username}`} disabled={isSelf || isRoot}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this user?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <span className="font-medium text-foreground">{user.username}</span> will lose access immediately, and their playlists will be deleted. Their listening progress on shared library items is unaffected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleDeleteUser(user)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Remove user
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-4 border-t pt-4">
          <AddUserForm onAdd={handleAddUser} isPending={createUser.isPending} />
        </div>
      </section>
    </div>
  )
}
