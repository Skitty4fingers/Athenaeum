import { useState } from 'react'
import { toast } from 'sonner'
import { ImageOff, Link2, Search, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Spinner } from '@/components/kibo-ui/spinner'
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/kibo-ui/dropzone'
import { COVER_PROVIDERS, useCoverSearch, useRemoveCover, useSetCoverFromUrl, useUploadCoverFile } from '@/hooks/use-cover'

interface CoverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
  title: string
  author: string
  hasCover: boolean
}

export function CoverDialog({ open, onOpenChange, itemId, title, author, hasCover }: CoverDialogProps) {
  const [provider, setProvider] = useState('best')
  const [hasSearched, setHasSearched] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const search = useCoverSearch(title, author, provider, hasSearched)
  const setFromUrl = useSetCoverFromUrl(itemId)
  const uploadFile = useUploadCoverFile(itemId)
  const removeCover = useRemoveCover(itemId)

  const busy = setFromUrl.isPending || uploadFile.isPending || removeCover.isPending

  async function applyUrl(url: string) {
    try {
      await setFromUrl.mutateAsync(url)
      toast.success('Cover updated')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not set that cover')
    }
  }

  async function onDrop(accepted: File[]) {
    setFiles(accepted)
    const file = accepted[0]
    if (!file) return
    try {
      await uploadFile.mutateAsync(file)
      toast.success('Cover uploaded')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload that file')
    } finally {
      setFiles([])
    }
  }

  async function onRemove() {
    try {
      await removeCover.mutateAsync()
      toast.success('Cover removed')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the cover')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Change cover</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="search" className="min-h-0 flex-1">
          <TabsList className="mx-6 mt-4">
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="size-3.5" />
              Search
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5">
              <Link2 className="size-3.5" />
              URL
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="size-3.5" />
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="px-6 py-4">
            <div className="flex gap-2">
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COVER_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => setHasSearched(true)} disabled={search.isFetching} className="gap-1.5">
                {search.isFetching ? <Spinner variant="ring" size={14} /> : <Search className="size-4" />}
                Search
              </Button>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto scrollbar-slim">
              {search.isFetching && (
                <div className="flex items-center justify-center py-10">
                  <Spinner variant="ring" size={20} className="text-muted-foreground" />
                </div>
              )}

              {hasSearched && !search.isFetching && search.isError && <p className="py-6 text-center text-sm text-muted-foreground">That provider couldn't be reached.</p>}

              {hasSearched && !search.isFetching && search.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No covers found.</p>}

              {!!search.data?.length && (
                <div className="grid grid-cols-4 gap-2">
                  {search.data.map((url, i) => (
                    <button key={url} type="button" onClick={() => void applyUrl(url)} disabled={busy} aria-label={`Use cover option ${i + 1}`} className="group relative aspect-[2/3] overflow-hidden rounded-md border transition-opacity hover:opacity-80 disabled:opacity-50">
                      <img src={url} alt="" className="size-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="px-6 py-4">
            <div className="flex gap-2">
              <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://…/cover.jpg" className="flex-1" />
              <Button onClick={() => void applyUrl(manualUrl)} disabled={!manualUrl.trim() || busy} className="gap-1.5">
                {setFromUrl.isPending && <Spinner variant="ring" size={14} />}
                Apply
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="px-6 py-4">
            <Dropzone accept={{ 'image/*': [] }} maxFiles={1} maxSize={20 * 1024 * 1024} src={files} onDrop={onDrop} disabled={busy}>
              <DropzoneEmptyState />
              <DropzoneContent />
            </Dropzone>
          </TabsContent>
        </Tabs>

        {hasCover && (
          <div className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => void onRemove()} disabled={busy} className="w-full gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="size-4" />
              Remove cover
            </Button>
          </div>
        )}

        {!hasCover && (
          <div className="flex items-center gap-2 border-t px-6 py-3 text-xs text-muted-foreground">
            <ImageOff className="size-3.5" />
            This book has no cover yet.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
