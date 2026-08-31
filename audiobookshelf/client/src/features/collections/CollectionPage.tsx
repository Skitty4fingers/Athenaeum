import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, FolderHeart, GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useCollection, useDeleteCollection, useRemoveBookFromCollection, useReorderCollection, useUpdateCollection } from '@/hooks/use-collections'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/kibo-ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { BookCard, BookCardSkeleton } from '@/features/library/BookCard'
import type { BookMediaMinified, LibraryItemMinified } from '@/types/abs'

const GRID_CLASS = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'

function RenameDialog({ name, description, onSave, isPending }: { name: string; description: string | null; onSave: (name: string, description: string) => void; isPending: boolean }) {
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [draftDescription, setDraftDescription] = useState(description ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draftName.trim()) return
    onSave(draftName.trim(), draftDescription.trim())
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setDraftName(name)
          setDraftDescription(description ?? '')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Rename collection">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename collection</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="collection-name">Name</Label>
            <Input id="collection-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} disabled={isPending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collection-description">Description</Label>
            <Input id="collection-description" value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} disabled={isPending} />
          </div>
          <DialogFooter className="mt-2">
            <Button type="submit" disabled={!draftName.trim() || isPending} className="gap-1.5">
              {isPending && <Spinner variant="ring" size={14} />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SortableCollectionBook({ item, onRemove }: { item: LibraryItemMinified; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const playItem = usePlayerStore((s) => s.play)

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'z-10 opacity-70' : undefined}>
      <div className="group/card relative">
        <button type="button" {...attributes} {...listeners} className="absolute -left-1 -top-1 z-20 flex size-6 cursor-grab touch-none items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover/card:opacity-100 active:cursor-grabbing" aria-label={`Reorder ${item.media.metadata.title ?? 'book'}`}>
          <GripVertical className="size-3.5" />
        </button>
        <button type="button" onClick={onRemove} className="absolute -right-1 -top-1 z-20 flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/card:opacity-100" aria-label={`Remove ${item.media.metadata.title ?? 'book'} from collection`}>
          <X className="size-3.5" />
        </button>
        <BookCard item={item} onPlay={(book) => void playItem(book)} />
      </div>
    </div>
  )
}

export function CollectionPage() {
  const { collectionId } = useParams<{ collectionId: string }>()
  const isAdmin = useAuthStore((s) => s.user?.type === 'root' || s.user?.type === 'admin')
  // Deleting a whole collection needs `canDelete`, not just `canUpdate` — the
  // server's default permissions only grant that to root, not admin, so
  // isAdmin alone would show a delete button that 403s for a plain admin.
  const canDelete = useAuthStore((s) => Boolean(s.user?.permissions.delete))

  const { data: collection, isPending, isError } = useCollection(collectionId)
  const updateCollection = useUpdateCollection(collectionId!)
  const reorderCollection = useReorderCollection(collectionId!)
  const removeBook = useRemoveBookFromCollection(collectionId!)
  const deleteCollection = useDeleteCollection()

  const [books, setBooks] = useState<LibraryItemMinified[]>([])
  useEffect(() => {
    if (collection) setBooks(collection.books)
  }, [collection])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = books.findIndex((b) => b.id === active.id)
    const newIndex = books.findIndex((b) => b.id === over.id)
    const reordered = arrayMove(books, oldIndex, newIndex)
    setBooks(reordered)
    try {
      await reorderCollection.mutateAsync(reordered.map((b) => b.id))
    } catch (error) {
      setBooks(books)
      toast.error(error instanceof Error ? error.message : 'Could not save that order')
    }
  }

  async function onRemove(itemId: string) {
    setBooks((prev) => prev.filter((b) => b.id !== itemId))
    try {
      await removeBook.mutateAsync(itemId)
      toast.success('Removed from collection')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that book')
      if (collection) setBooks(collection.books)
    }
  }

  async function onRename(name: string, description: string) {
    try {
      await updateCollection.mutateAsync({ name, description })
      toast.success('Collection updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update that collection')
    }
  }

  const [deleted, setDeleted] = useState(false)
  async function onDelete() {
    if (!collectionId) return
    try {
      await deleteCollection.mutateAsync(collectionId)
      toast.success('Collection deleted')
      setDeleted(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete that collection')
    }
  }

  if (deleted) return <Navigate to="/" replace />

  const totalDuration = books.reduce((sum, item) => sum + ((item.media as BookMediaMinified).duration ?? 0), 0)

  return (
    <div className="mx-auto w-full max-w-[120rem] px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      {isPending && (
        <div className="mb-6 space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      )}

      {isError && <p className="text-sm text-muted-foreground">Couldn't load this collection.</p>}

      {collection && (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderHeart className="size-4" />
              Collection
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
              {isAdmin && <RenameDialog name={collection.name} description={collection.description} onSave={onRename} isPending={updateCollection.isPending} />}
            </div>
            {collection.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{collection.description}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              {books.length} book{books.length === 1 ? '' : 's'}
              {totalDuration > 0 && <> · {formatDuration(totalDuration)}</>}
            </p>
          </div>

          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Delete collection">
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this collection?</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span className="font-medium text-foreground">{collection.name}</span> will be removed. The books themselves aren't touched — only this shelf.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete collection
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {isPending && (
        <div className={GRID_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}

      {collection && books.length === 0 && <p className="text-sm text-muted-foreground">This collection has no books left.</p>}

      {books.length > 0 &&
        (isAdmin ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={books.map((b) => b.id)} strategy={rectSortingStrategy}>
              <div className={GRID_CLASS}>
                {books.map((item) => (
                  <SortableCollectionBook key={item.id} item={item} onRemove={() => void onRemove(item.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className={GRID_CLASS}>
            {books.map((item) => (
              <BookCard key={item.id} item={item} />
            ))}
          </div>
        ))}
    </div>
  )
}
