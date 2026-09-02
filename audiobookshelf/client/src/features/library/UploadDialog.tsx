import { useState } from 'react'
import { toast } from 'sonner'
import { Upload as UploadIcon } from 'lucide-react'

import { useCurrentLibrary } from '@/hooks/use-library'
import { useAuthStore } from '@/stores/auth'
import { useUploadItem } from '@/hooks/use-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/kibo-ui/dropzone'
import { Spinner } from '@/components/kibo-ui/spinner'

export function UploadDialog() {
  const [open, setOpen] = useState(false)
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [series, setSeries] = useState('')
  const [sequence, setSequence] = useState('')
  const [folderId, setFolderId] = useState<string>('')
  const [files, setFiles] = useState<File[]>([])

  const upload = useUploadItem()

  const activeFolderId = folderId || library?.folders[0]?.id || ''

  function reset() {
    setTitle('')
    setAuthor('')
    setSeries('')
    setSequence('')
    setFolderId('')
    setFiles([])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!library || !activeFolderId || !title.trim() || files.length === 0) return
    try {
      const result = await upload.mutateAsync({ libraryId: library.id, folderId: activeFolderId, title: title.trim(), author: author.trim() || undefined, series: series.trim() || undefined, sequence: sequence.trim() || undefined, files })
      if (result.sequenceApplied === false) {
        // The upload itself succeeded; only the position write timed out. Say
        // so plainly and point at the editor that fixes it.
        toast.warning('Uploaded, but the series position was not set', { description: 'The scan took longer than expected. Set the order from the series page.' })
      } else {
        toast.success(result.sequenceApplied ? 'Uploaded and placed in the series' : 'Uploaded — it will appear once the library picks up the new files')
      }
      reset()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload those files')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Upload a book" title="Upload">
          <UploadIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a book</DialogTitle>
          <DialogDescription>Audio files land in a new folder named from the title below — the server builds the path from Title, Author and Series.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="upload-title">Title</Label>
              <Input id="upload-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project Hail Mary" disabled={upload.isPending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upload-author">Author</Label>
              <Input id="upload-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Andy Weir" disabled={upload.isPending} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="upload-series">Series (optional)</Label>
              <div className="flex gap-2">
                <Input id="upload-series" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="e.g. The Dark Tower" disabled={upload.isPending} className="flex-1" />
                {/* The upload endpoint only uses `series` as a folder name and
                    stores no position, so a book uploaded without this sorts
                    arbitrarily within its series. Written after the scan. */}
                <Input
                  id="upload-sequence"
                  value={sequence}
                  onChange={(e) => setSequence(e.target.value)}
                  placeholder="#"
                  aria-label="Position in series"
                  title="Position in series, e.g. 2"
                  disabled={upload.isPending || !series.trim()}
                  className="w-16"
                />
              </div>
            </div>
            {(library?.folders.length ?? 0) > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="upload-folder">Folder</Label>
                <Select value={activeFolderId} onValueChange={setFolderId} disabled={upload.isPending}>
                  <SelectTrigger id="upload-folder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {library?.folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.fullPath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Audio files</Label>
            <Dropzone accept={{ 'audio/*': [] }} maxFiles={200} src={files} onDrop={setFiles} disabled={upload.isPending}>
              <DropzoneEmptyState />
              <DropzoneContent />
            </Dropzone>
          </div>

          <DialogFooter className="mt-2">
            <Button type="submit" disabled={!title.trim() || files.length === 0 || upload.isPending} className="gap-1.5">
              {upload.isPending ? <Spinner variant="ring" size={14} /> : <UploadIcon className="size-4" />}
              Upload {files.length > 0 && `${files.length} file${files.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
