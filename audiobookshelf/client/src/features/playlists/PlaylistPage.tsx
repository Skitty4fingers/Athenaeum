import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, GripVertical, ListMusic, Pencil, Trash2, X } from 'lucide-react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useDeletePlaylist, usePlaylist, useRemoveItemFromPlaylist, useReorderPlaylist, useUpdatePlaylist } from '@/hooks/use-playlists'
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
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Rename playlist">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename playlist</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="playlist-name">Name</Label>
            <Input id="playlist-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} disabled={isPending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="playlist-description">Description</Label>
            <Input id="playlist-description" value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} disabled={isPending} />
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

function SortablePlaylistItem({ item, onRemove }: { item: LibraryItemMinified; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const playItem = usePlayerStore((s) => s.play)

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'z-10 opacity-70' : undefined}>
      <div className="group/card relative">
        <button type="button" {...attributes} {...listeners} className="absolute -left-1 -top-1 z-20 flex size-6 cursor-grab touch-none items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover/card:opacity-100 active:cursor-grabbing" aria-label={`Reorder ${item.media.metadata.title ?? 'book'}`}>
          <GripVertical className="size-3.5" />
        </button>
        <button type="button" onClick={onRemove} className="absolute -right-1 -top-1 z-20 flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/card:opacity-100" aria-label={`Remove ${item.media.metadata.title ?? 'book'} from playlist`}>
          <X className="size-3.5" />
        </button>
        <BookCard item={item} onPlay={(book) => void playItem(book)} />
      </div>
    </div>
  )
}

export function PlaylistPage() {
  const { playlistId } = useParams<{ playlistId: string }>()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data: playlist, isPending, isError } = usePlaylist(playlistId)
  const isOwner = playlist?.userId === currentUserId

  const updatePlaylist = useUpdatePlaylist(playlistId!)
  const reorderPlaylist = useReorderPlaylist(playlistId!)
  const removeItem = useRemoveItemFromPlaylist(playlistId!)
  const deletePlaylist = useDeletePlaylist()

  const [items, setItems] = useState<LibraryItemMinified[]>([])
  useEffect(() => {
    if (playlist) setItems(playlist.items.map((i) => i.libraryItem))
  }, [playlist])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((b) => b.id === active.id)
    const newIndex = items.findIndex((b) => b.id === over.id)
    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)
    try {
      await reorderPlaylist.mutateAsync(reordered.map((b) => b.id))
    } catch (error) {
      setItems(items)
      toast.error(error instanceof Error ? error.message : 'Could not save that order')
    }
  }

  async function onRemove(itemId: string) {
    setItems((prev) => prev.filter((b) => b.id !== itemId))
    try {
      await removeItem.mutateAsync(itemId)
      toast.success('Removed from playlist')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that item')
      if (playlist) setItems(playlist.items.map((i) => i.libraryItem))
    }
  }

  async function onRename(name: string, description: string) {
    try {
      await updatePlaylist.mutateAsync({ name, description })
      toast.success('Playlist updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update that playlist')
    }
  }

  const [deleted, setDeleted] = useState(false)
  async function onDelete() {
    if (!playlistId) return
    try {
      await deletePlaylist.mutateAsync(playlistId)
      toast.success('Playlist deleted')
      setDeleted(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete that playlist')
    }
  }

  if (deleted) return <Navigate to="/" replace />

  const totalDuration = items.reduce((sum, item) => sum + ((item.media as BookMediaMinified).duration ?? 0), 0)

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

      {isError && <p className="text-sm text-muted-foreground">Couldn't load this playlist.</p>}

      {playlist && (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListMusic className="size-4" />
              Playlist
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">{playlist.name}</h1>
              {isOwner && <RenameDialog name={playlist.name} description={playlist.description} onSave={onRename} isPending={updatePlaylist.isPending} />}
            </div>
            {playlist.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{playlist.description}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length} book{items.length === 1 ? '' : 's'}
              {totalDuration > 0 && <> · {formatDuration(totalDuration)}</>}
            </p>
          </div>

          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Delete playlist">
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this playlist?</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span className="font-medium text-foreground">{playlist.name}</span> will be removed. The books themselves aren't touched — only this playlist.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete playlist
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

      {playlist && items.length === 0 && <p className="text-sm text-muted-foreground">This playlist has no books left.</p>}

      {items.length > 0 &&
        (isOwner ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={items.map((b) => b.id)} strategy={rectSortingStrategy}>
              <div className={GRID_CLASS}>
                {items.map((item) => (
                  <SortablePlaylistItem key={item.id} item={item} onRemove={() => void onRemove(item.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className={GRID_CLASS}>
            {items.map((item) => (
              <BookCard key={item.id} item={item} />
            ))}
          </div>
        ))}
    </div>
  )
}
