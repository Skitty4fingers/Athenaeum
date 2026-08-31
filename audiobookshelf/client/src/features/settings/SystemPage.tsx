import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, DatabaseBackup, Download, PenLine, RefreshCw, ScrollText, Trash2 } from 'lucide-react'

import { useBackups, useCreateBackup, useDeleteBackup, backupDownloadUrl } from '@/hooks/use-backups'
import { useLoggerData } from '@/hooks/use-logs'
import { formatBytes } from '@/lib/format'
import { defaultAppName } from '@/lib/config'
import { cn } from '@/lib/utils'
import { useAppName, useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/kibo-ui/spinner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import type { LogEntry } from '@/types/abs'

/** How many of the most recent log lines to render — the endpoint already caps at 5000, which is too many DOM nodes for a plain scroll panel. */
const MAX_VISIBLE_LOGS = 300

const LEVEL_CLASS: Record<string, string> = {
  ERROR: 'text-destructive',
  WARN: 'text-playing',
  INFO: 'text-foreground',
  DEBUG: 'text-muted-foreground'
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex items-start gap-2 py-0.5 font-mono text-xs leading-relaxed">
      <span className="shrink-0 text-muted-foreground/70">{entry.timestamp}</span>
      <span className={cn('shrink-0 font-semibold', LEVEL_CLASS[entry.levelName] ?? 'text-foreground')}>{entry.levelName}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-muted-foreground">{entry.message}</span>
    </div>
  )
}

export function SystemPage() {
  const { data: backupsData, isPending: backupsPending } = useBackups()
  const createBackup = useCreateBackup()
  const deleteBackup = useDeleteBackup()

  const { data: logs, isPending: logsPending, refetch: refetchLogs, isFetching: logsFetching } = useLoggerData()
  const [logFilter, setLogFilter] = useState<string | null>(null)

  const appName = useAppName()
  const updateServerSettings = useAuthStore((s) => s.updateServerSettings)
  const [appNameDraft, setAppNameDraft] = useState(appName)
  const [savingAppName, setSavingAppName] = useState(false)
  useEffect(() => setAppNameDraft(appName), [appName])

  async function onSaveAppName() {
    const trimmed = appNameDraft.trim()
    setSavingAppName(true)
    try {
      await updateServerSettings({ customAppName: trimmed || null })
      toast.success('App name saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the app name')
    } finally {
      setSavingAppName(false)
    }
  }

  async function onCreateBackup() {
    try {
      await createBackup.mutateAsync()
      toast.success('Backup created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create a backup')
    }
  }

  async function onDeleteBackup(id: string) {
    try {
      await deleteBackup.mutateAsync(id)
      toast.success('Backup deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete that backup')
    }
  }

  const visibleLogs = (logs ?? [])
    .slice(-MAX_VISIBLE_LOGS)
    .reverse()
    .filter((l) => !logFilter || l.levelName === logFilter)
  const levels = Array.from(new Set((logs ?? []).map((l) => l.levelName)))

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6 flex items-center gap-2.5">
        <DatabaseBackup className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">System settings</h1>
      </div>

      {/* Branding */}
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <PenLine className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Branding</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">The name shown in the sidebar, sign-in screen, tab title, and Help page — for everyone who connects to this server.</p>

        <div className="mt-4 flex items-center gap-2">
          <Input value={appNameDraft} onChange={(e) => setAppNameDraft(e.target.value)} placeholder={defaultAppName} maxLength={64} className="max-w-xs" aria-label="App name" />
          <Button onClick={() => void onSaveAppName()} disabled={savingAppName || appNameDraft.trim() === appName} className="shrink-0 gap-1.5">
            {savingAppName && <Spinner variant="ring" size={14} />}
            Save
          </Button>
        </div>
      </section>

      {/* Backups */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Backups</h2>
            {backupsData && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{backupsData.backupLocation}</p>}
          </div>
          <Button onClick={() => void onCreateBackup()} disabled={createBackup.isPending} className="shrink-0 gap-1.5">
            {createBackup.isPending ? <Spinner variant="ring" size={14} /> : <DatabaseBackup className="size-4" />}
            Create backup
          </Button>
        </div>

        {backupsPending && (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {backupsData && backupsData.backups.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No backups yet.</p>}

        {!!backupsData?.backups.length && (
          <ul className="mt-4 space-y-2">
            {backupsData.backups.map((backup) => (
              <li key={backup.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{backup.datePretty}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBytes(backup.fileSize)} · v{backup.serverVersion}
                  </p>
                </div>
                <Button asChild variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label={`Download backup from ${backup.datePretty}`}>
                  <a href={backupDownloadUrl(backup.id)} download={backup.filename}>
                    <Download className="size-3.5" />
                  </a>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Delete backup from ${backup.datePretty}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The backup from <span className="font-medium text-foreground">{backup.datePretty}</span> will be permanently removed. Download it first if you want to keep a copy.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void onDeleteBackup(backup.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete backup
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Logs */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Today's log</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetchLogs()} disabled={logsFetching} className="shrink-0 gap-1.5">
            <RefreshCw className={cn('size-3.5', logsFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {!!levels.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setLogFilter(null)} className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', !logFilter ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/60')}>
              All
            </button>
            {levels.map((level) => (
              <button key={level} type="button" onClick={() => setLogFilter(level)} className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', logFilter === level ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/60')}>
                {level}
              </button>
            ))}
          </div>
        )}

        {logsPending && (
          <div className="mt-4 space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {logs && logs.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No log entries yet today.</p>}

        {visibleLogs.length > 0 && (
          <div className="mt-4 max-h-[32rem] overflow-y-auto rounded-lg border bg-muted/20 p-2.5">
            {visibleLogs.map((entry, i) => (
              <LogLine key={i} entry={entry} />
            ))}
          </div>
        )}
        {!!logs?.length && visibleLogs.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No entries at this level.</p>}
      </section>
    </div>
  )
}
