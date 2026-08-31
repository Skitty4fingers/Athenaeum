import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Tags } from 'lucide-react'

import { useBatchUpdateMetadata } from '@/hooks/use-batch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Spinner } from '@/components/kibo-ui/spinner'
import type { BookMediaMinified, LibraryItemMinified } from '@/types/abs'

/**
 * The server replaces `tags`/`genres` wholesale per item rather than merging
 * (`Book.updateFromRequest`), so "add a tag to N books" has to read each
 * book's *current* array and append to it client-side — there's no
 * server-side "add one value" primitive to lean on. Podcasts are skipped;
 * this app's scope is audiobooks only (see README).
 */
export function BatchEditTagsDialog({ items, trigger, onDone }: { items: LibraryItemMinified[]; trigger: React.ReactNode; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [tagValue, setTagValue] = useState('')
  const [genreValue, setGenreValue] = useState('')
  const batchUpdate = useBatchUpdateMetadata()

  const books = items.filter((i): i is LibraryItemMinified & { media: BookMediaMinified } => i.mediaType === 'book')

  async function addTag(e: React.FormEvent) {
    e.preventDefault()
    const value = tagValue.trim()
    if (!value || !books.length) return
    try {
      await batchUpdate.mutateAsync(
        books.map((item) => ({
          id: item.id,
          mediaPayload: { metadata: {}, tags: item.media.tags.includes(value) ? item.media.tags : [...item.media.tags, value] }
        }))
      )
      toast.success(`Tagged ${books.length} book${books.length === 1 ? '' : 's'} "${value}"`)
      setTagValue('')
      onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that tag')
    }
  }

  async function addGenre(e: React.FormEvent) {
    e.preventDefault()
    const value = genreValue.trim()
    if (!value || !books.length) return
    try {
      await batchUpdate.mutateAsync(
        books.map((item) => ({
          id: item.id,
          mediaPayload: { metadata: { genres: item.media.metadata.genres.includes(value) ? item.media.metadata.genres : [...item.media.metadata.genres, value] } }
        }))
      )
      toast.success(`Added genre "${value}" to ${books.length} book${books.length === 1 ? '' : 's'}`)
      setGenreValue('')
      onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that genre')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit {books.length} book{books.length === 1 ? '' : 's'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={addTag} className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="batch-tag">Add a tag</Label>
            <Input id="batch-tag" value={tagValue} onChange={(e) => setTagValue(e.target.value)} placeholder="e.g. favorites" disabled={batchUpdate.isPending} />
          </div>
          <Button type="submit" disabled={!tagValue.trim() || batchUpdate.isPending} className="gap-1.5">
            {batchUpdate.isPending ? <Spinner variant="ring" size={14} /> : <Plus className="size-4" />}
            Add
          </Button>
        </form>

        <form onSubmit={addGenre} className="flex items-end gap-2 border-t pt-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="batch-genre">Add a genre</Label>
            <Input id="batch-genre" value={genreValue} onChange={(e) => setGenreValue(e.target.value)} placeholder="e.g. Fantasy" disabled={batchUpdate.isPending} />
          </div>
          <Button type="submit" disabled={!genreValue.trim() || batchUpdate.isPending} className="gap-1.5">
            {batchUpdate.isPending ? <Spinner variant="ring" size={14} /> : <Tags className="size-4" />}
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
