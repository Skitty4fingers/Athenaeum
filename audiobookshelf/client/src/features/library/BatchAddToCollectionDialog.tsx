import { useState } from 'react'
import { toast } from 'sonner'
import { FolderHeart, Plus } from 'lucide-react'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary } from '@/hooks/use-library'
import { useCollections, useCreateCollection } from '@/hooks/use-collections'
import { useBatchAddToCollection } from '@/hooks/use-batch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Spinner } from '@/components/kibo-ui/spinner'

function CollectionAddRow({ collectionId, name, bookCount, itemIds, onDone }: { collectionId: string; name: string; bookCount: number; itemIds: string[]; onDone: () => void }) {
  const addBatch = useBatchAddToCollection(collectionId)

  async function add() {
    try {
      await addBatch.mutateAsync(itemIds)
      toast.success(`Added ${itemIds.length} book${itemIds.length === 1 ? '' : 's'} to "${name}"`)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add to that collection')
    }
  }

  return (
    <button type="button" onClick={() => void add()} disabled={addBatch.isPending} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60 disabled:opacity-50">
      <FolderHeart className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {addBatch.isPending ? <Spinner variant="ring" size={13} /> : <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{bookCount} books</span>}
    </button>
  )
}

export function BatchAddToCollectionDialog({ itemIds, trigger, onDone }: { itemIds: string[]; trigger: React.ReactNode; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)
  const { data: collections } = useCollections(library?.id)
  const createCollection = useCreateCollection()

  async function createNewAndAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!library || !newName.trim() || itemIds.length === 0) return
    try {
      const [firstId, ...rest] = itemIds
      const created = await createCollection.mutateAsync({ libraryId: library.id, name: newName.trim(), bookId: firstId })
      if (rest.length) await api.post(`/collections/${created.id}/batch/add`, { books: rest })
      toast.success(`Collection created with ${itemIds.length} book${itemIds.length === 1 ? '' : 's'}`)
      setNewName('')
      setOpen(false)
      onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create that collection')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Add {itemIds.length} book{itemIds.length === 1 ? '' : 's'} to collection
          </DialogTitle>
        </DialogHeader>

        {!!collections?.length && (
          <div className="-mx-1.5 max-h-64 space-y-0.5 overflow-y-auto">
            {collections.map((collection) => (
              <CollectionAddRow
                key={collection.id}
                collectionId={collection.id}
                name={collection.name}
                bookCount={collection.books.length}
                itemIds={itemIds}
                onDone={() => {
                  setOpen(false)
                  onDone?.()
                }}
              />
            ))}
          </div>
        )}
        {!collections?.length && <p className="text-sm text-muted-foreground">No collections yet — create the first one below.</p>}

        <form onSubmit={createNewAndAdd} className="flex items-end gap-2 border-t pt-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="batch-new-collection-name">New collection</Label>
            <Input id="batch-new-collection-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Best of 2025" disabled={createCollection.isPending} />
          </div>
          <Button type="submit" disabled={!newName.trim() || createCollection.isPending} className="gap-1.5">
            {createCollection.isPending ? <Spinner variant="ring" size={14} /> : <Plus className="size-4" />}
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
