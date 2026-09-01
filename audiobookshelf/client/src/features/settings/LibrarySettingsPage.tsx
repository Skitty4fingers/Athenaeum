import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, FolderPlus, Key, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary } from '@/hooks/use-library'
import { useAddLibraryFolder, useRemoveLibraryFolder, useTriggerScan, useUpdateFinishThreshold, useUpdateMetadataPrecedence } from '@/hooks/use-library-settings'
import { useLibraryScanStatus } from '@/hooks/use-scan-status'
import { useMetadataProviders } from '@/hooks/use-enrichment'
import { useAddMetadataProvider, useRemoveMetadataProvider, type AddProviderInput } from '@/hooks/use-metadata-providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/kibo-ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { LibrarySettings } from '@/types/abs'

/**
 * Human labels for audiobookshelf's metadata source order (Library.settings.metadataPrecedence).
 * Sources later in the list win when they disagree — the scanner applies them
 * in order, each overwriting fields the ones before it set. This is what makes
 * a generated metadata.json (absMetadata, last by default) beat both the
 * folder name and embedded audio tags — see scripts/libation-to-abs.mjs.
 */
const PRECEDENCE_LABELS: Record<string, { label: string; hint: string }> = {
  folderStructure: { label: 'Folder structure', hint: 'Author/series/title parsed from the file path' },
  audioMetatags: { label: 'Audio file tags', hint: 'ID3/M4B tags embedded in the audio itself' },
  nfoFile: { label: 'NFO file', hint: 'A Calibre-style .nfo sidecar' },
  txtFiles: { label: 'Text files', hint: 'metadata.txt / desc.txt / reader.txt' },
  opfFile: { label: 'OPF file', hint: 'A Calibre metadata.opf sidecar' },
  absMetadata: { label: 'metadata.json', hint: "Audiobookshelf's own sidecar format — what scripts/libation-to-abs.mjs generates" }
}

function formatDate(ms: number | null): string {
  if (!ms) return 'Never'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function AddFolderForm({ onAdd, isPending }: { onAdd: (path: string) => void; isPending: boolean }) {
  const [path, setPath] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = path.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setPath('')
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="new-folder-path">Add a folder</Label>
        <Input id="new-folder-path" placeholder="e.g. C:\path\to\your\audiobooks" value={path} onChange={(e) => setPath(e.target.value)} disabled={isPending} className="font-mono text-sm" />
      </div>
      <Button type="submit" disabled={!path.trim() || isPending} className="gap-1.5">
        {isPending ? <Spinner variant="ring" size={14} /> : <FolderPlus className="size-4" />}
        Add
      </Button>
    </form>
  )
}

function AddProviderForm({ onAdd, isPending }: { onAdd: (input: AddProviderInput) => void; isPending: boolean }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [mediaType, setMediaType] = useState<AddProviderInput['mediaType']>('book')
  const [authHeaderValue, setAuthHeaderValue] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    onAdd({ name: name.trim(), url: url.trim(), mediaType, authHeaderValue: authHeaderValue.trim() || undefined })
    setName('')
    setUrl('')
    setAuthHeaderValue('')
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="provider-name">Name</Label>
          <Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Metadata Service" disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="provider-media-type">Media type</Label>
          <Select value={mediaType} onValueChange={(v) => setMediaType(v as AddProviderInput['mediaType'])}>
            <SelectTrigger id="provider-media-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="book">Book</SelectItem>
              <SelectItem value="podcast">Podcast</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="provider-url">URL</Label>
        <Input id="provider-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="e.g. http://localhost:PORT" disabled={isPending} className="font-mono text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="provider-auth">Authorization header (optional)</Label>
        <Input id="provider-auth" type="password" value={authHeaderValue} onChange={(e) => setAuthHeaderValue(e.target.value)} placeholder="Sent as-is in the Authorization header" disabled={isPending} className="font-mono text-sm" />
      </div>
      <Button type="submit" disabled={!name.trim() || !url.trim() || isPending} className="gap-1.5">
        {isPending ? <Spinner variant="ring" size={14} /> : <Plus className="size-4" />}
        Add provider
      </Button>
    </form>
  )
}

export function LibrarySettingsPage() {
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library, isPending: libraryPending } = useCurrentLibrary(defaultLibraryId ?? undefined)

  const addFolder = useAddLibraryFolder()
  const removeFolder = useRemoveLibraryFolder()
  const updatePrecedence = useUpdateMetadataPrecedence()
  const updateFinishThreshold = useUpdateFinishThreshold()
  const triggerScan = useTriggerScan()
  const { isScanning, lastResult } = useLibraryScanStatus(library?.id)

  const { data: providers } = useMetadataProviders()
  const addProvider = useAddMetadataProvider()
  const removeProvider = useRemoveMetadataProvider()

  const [precedence, setPrecedence] = useState<LibrarySettings['metadataPrecedence']>([])
  const [precedenceDirty, setPrecedenceDirty] = useState(false)

  const [finishThreshold, setFinishThreshold] = useState('')
  const finishThresholdDirty = library ? finishThreshold !== '' && Number(finishThreshold) !== (library.settings.markAsFinishedTimeRemaining ?? 10) : false

  // Seed local ordering state from the server once the library loads, and
  // again any time it changes elsewhere (e.g. a scan completing doesn't touch
  // this, but a fresh load should always reflect the real value).
  useEffect(() => {
    if (library && !precedenceDirty) setPrecedence(library.settings.metadataPrecedence)
  }, [library, precedenceDirty])

  useEffect(() => {
    if (library && !finishThresholdDirty) setFinishThreshold(String(library.settings.markAsFinishedTimeRemaining ?? 10))
  }, [library])

  // Announce scan completion once, right when the result lands.
  useEffect(() => {
    if (lastResult) toast.success(`Scan complete — ${lastResult.text}`)
     
  }, [lastResult])

  const knownSources = useMemo(() => precedence.filter((key) => PRECEDENCE_LABELS[key]), [precedence])

  function move(index: number, direction: -1 | 1) {
    setPrecedence((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setPrecedenceDirty(true)
  }

  async function savePrecedence() {
    if (!library) return
    try {
      await updatePrecedence.mutateAsync({ libraryId: library.id, metadataPrecedence: precedence })
      setPrecedenceDirty(false)
      toast.success('Metadata precedence saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save precedence')
    }
  }

  async function saveFinishThreshold() {
    if (!library) return
    const seconds = Number(finishThreshold)
    if (!Number.isFinite(seconds) || seconds < 0) {
      toast.error('Enter a whole number of seconds')
      return
    }
    try {
      await updateFinishThreshold.mutateAsync({ libraryId: library.id, markAsFinishedTimeRemaining: seconds })
      toast.success('Auto-finish threshold saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that')
    }
  }

  async function handleAddProvider(input: AddProviderInput) {
    try {
      await addProvider.mutateAsync(input)
      toast.success('Provider added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that provider')
    }
  }

  async function handleRemoveProvider(providerId: string) {
    try {
      await removeProvider.mutateAsync(providerId)
      toast.success('Provider removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that provider')
    }
  }

  async function handleAddFolder(path: string) {
    if (!library) return
    try {
      await addFolder.mutateAsync({ library, path })
      toast.success('Folder added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that folder')
    }
  }

  async function handleRemoveFolder(folderId: string) {
    if (!library) return
    try {
      await removeFolder.mutateAsync({ library, folderId })
      toast.success('Folder removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that folder')
    }
  }

  async function handleScan(force: boolean) {
    if (!library) return
    try {
      await triggerScan.mutateAsync({ libraryId: library.id, force })
      toast.info(force ? 'Forced rescan started' : 'Scan started')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the scan')
    }
  }

  if (libraryPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!library) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center">
        <p className="font-medium">No library found</p>
      </div>
    )
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
        <Settings className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{library.name}</h1>
      </div>

      {/* Folders */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-medium">Folders</h2>
        <p className="mt-1 text-sm text-muted-foreground">Everywhere audiobookshelf looks for books in this library.</p>

        <ul className="mt-4 space-y-2">
          {library.folders.map((folder) => (
            <li key={folder.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-sm" title={folder.fullPath}>
                {folder.fullPath}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove folder ${folder.fullPath}`} disabled={library.folders.length <= 1}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this folder?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <span className="font-mono text-xs">{folder.fullPath}</span> will be removed from the library, and every book scanned from it will be removed too. The files themselves are not touched — only the library's record of them.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleRemoveFolder(folder.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Remove folder
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
          {library.folders.length <= 1 && <p className="text-xs text-muted-foreground/70">A library needs at least one folder, so the last one can't be removed here.</p>}
        </ul>

        <div className="mt-4 border-t pt-4">
          <AddFolderForm onAdd={handleAddFolder} isPending={addFolder.isPending} />
          <p className="mt-1.5 text-xs text-muted-foreground/70">A new path that doesn't exist yet will be created.</p>
        </div>
      </section>

      {/* Scan */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Scan</h2>
            <p className="mt-1 text-sm text-muted-foreground">Last scanned: {formatDate(library.lastScan)}</p>
          </div>
          {isScanning && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Spinner variant="ring" size={13} />
              Scanning…
            </span>
          )}
        </div>

        {lastResult && !isScanning && <p className="mt-2 text-sm text-muted-foreground">Last result: {lastResult.text}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void handleScan(false)} disabled={isScanning || triggerScan.isPending} className="gap-1.5">
            <RefreshCw className={cn('size-4', isScanning && 'animate-spin')} />
            Scan for changes
          </Button>
          <Button variant="outline" onClick={() => void handleScan(true)} disabled={isScanning || triggerScan.isPending}>
            Force full rescan
          </Button>
        </div>
      </section>

      {/* Playback */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-medium">Playback</h2>
        <p className="mt-1 text-sm text-muted-foreground">A book auto-marks finished once this many seconds remain, on every position update while playing.</p>

        <div className="mt-4 flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="finish-threshold">Seconds remaining</Label>
            <Input id="finish-threshold" type="number" min={0} step={1} value={finishThreshold} onChange={(e) => setFinishThreshold(e.target.value)} className="w-28" />
          </div>
          <Button onClick={() => void saveFinishThreshold()} disabled={!finishThresholdDirty || updateFinishThreshold.isPending} className="gap-1.5">
            {updateFinishThreshold.isPending && <Spinner variant="ring" size={14} />}
            Save
          </Button>
        </div>
      </section>

      {/* Metadata precedence */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-medium">Metadata precedence</h2>
        <p className="mt-1 text-sm text-muted-foreground">When sources disagree, the one lower in this list wins.</p>

        <ol className="mt-4 space-y-1.5">
          {knownSources.map((key, index) => {
            const meta = PRECEDENCE_LABELS[key]
            return (
              <li key={key} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <span className="w-5 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{meta.hint}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${meta.label} up`}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => move(index, 1)} disabled={index === knownSources.length - 1} aria-label={`Move ${meta.label} down`}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="mt-4 flex items-center gap-3 border-t pt-4">
          <Button onClick={() => void savePrecedence()} disabled={!precedenceDirty || updatePrecedence.isPending} className="gap-1.5">
            {updatePrecedence.isPending && <Spinner variant="ring" size={14} />}
            Save order
          </Button>
          {precedenceDirty && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="size-3" />
              Unsaved changes
            </span>
          )}
        </div>
      </section>

      {/* Metadata providers */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-medium">Metadata providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Custom sources for the <span className="font-medium text-foreground">Enrich metadata</span> dialog on item pages, alongside the built-in Audible, Google Books and iTunes.
        </p>

        {!!providers?.length && (
          <ul className="mt-4 space-y-2">
            {providers.map((provider) => (
              <li key={provider.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{provider.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{provider.mediaType}</span>
                    {provider.authHeaderValue && (
                      <span title="Sends an Authorization header">
                        <Key className="size-3 shrink-0 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">{provider.url}</p>
                </div>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void handleRemoveProvider(provider.id)} aria-label={`Remove provider ${provider.name}`}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className={cn('border-t pt-4', providers?.length ? 'mt-4' : 'mt-0')}>
          <AddProviderForm onAdd={handleAddProvider} isPending={addProvider.isPending} />
          {/* There is no update endpoint server-side (create/delete only), so
              changing a provider's URL or key means removing it and adding it
              again — not pretending there's an in-place edit that doesn't exist. */}
          <p className="mt-2 text-xs text-muted-foreground/70">To change a provider's URL or key, remove it and add it again — there's no in-place edit.</p>
        </div>
      </section>
    </div>
  )
}
