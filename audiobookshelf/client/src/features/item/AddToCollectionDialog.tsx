import { useState } from 'react'
import { toast } from 'sonner'
import { Check, FolderPlus, Plus } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary } from '@/hooks/use-library'
import { useAddBookToCollection, useCollections, useCreateCollection, useRemoveBookFromCollection } from '@/hooks/use-collections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Spinner } from '@/components/kibo-ui/spinner'
import type { Collection } from '@/types/abs'

function CollectionRow({ collection, itemId }: { collection: Collection; itemId: string }) {
  const isMember = collection.books.some((b) => b.id === itemId)
  const addBook = useAddBookToCollection(collection.id)
  const removeBook = useRemoveBookFromCollection(collection.id)
  const isPending = addBook.isPending || removeBook.isPending

  async function toggle() {
    try {
      if (isMember) await removeBook.mutateAsync(itemId)
      else await addBook.mutateAsync(itemId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update that collection')
    }
  }

  return (
    <button type="button" onClick={() => void toggle()} disabled={isPending} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60 disabled:opacity-50">
      <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${isMember ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>{isPending ? <Spinner variant="ring" size={11} /> : isMember && <Check className="size-3.5" />}</div>
      <span className="min-w-0 flex-1 truncate">{collection.name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {collection.books.length} book{collection.books.length === 1 ? '' : 's'}
      </span>
    </button>
  )
}

export function AddToCollectionDialog({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)
  const { data: collections } = useCollections(library?.id)
  const createCollection = useCreateCollection()

  async function createNew(e: React.FormEvent) {
    e.preventDefault()
    if (!library || !newName.trim()) return
    try {
      await createCollection.mutateAsync({ libraryId: library.id, name: newName.trim(), bookId: itemId })
      toast.success('Collection created')
      setNewName('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create that collection')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <FolderPlus className="size-4" />
          Add to collection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to collection</DialogTitle>
        </DialogHeader>

        {!!collections?.length && (
          <div className="-mx-1.5 max-h-64 space-y-0.5 overflow-y-auto">
            {collections.map((collection) => (
              <CollectionRow key={collection.id} collection={collection} itemId={itemId} />
            ))}
          </div>
        )}
        {!collections?.length && <p className="text-sm text-muted-foreground">No collections yet — create the first one below.</p>}

        <form onSubmit={createNew} className="flex items-end gap-2 border-t pt-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-collection-name">New collection</Label>
            <Input id="new-collection-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Best of 2025" disabled={createCollection.isPending} />
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
