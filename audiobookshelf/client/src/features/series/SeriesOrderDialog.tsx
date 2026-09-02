import { useState } from 'react'
import { toast } from 'sonner'
import { GripVertical, ListOrdered } from 'lucide-react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/kibo-ui/spinner'
import { useReorderSeries, sequenceForPosition } from '@/hooks/use-series'
import type { LibraryItemMinified } from '@/types/abs'

interface SeriesRef {
  id: string
  sequence: string | null
}

interface SeriesBook {
  id: string
  title: string
  sequence: string | null
}

function SortableRow({ book, position }: { book: SeriesBook; position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: book.id })
  const nextSequence = sequenceForPosition(position)
  const changed = (book.sequence ?? '') !== nextSequence

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-md border bg-card px-2.5 py-2 ${isDragging ? 'z-10 opacity-70 shadow-md' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing"
        aria-label={`Reorder ${book.title}`}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums" aria-hidden>
        {nextSequence}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm">{book.title}</span>

      {/* Only annotate rows that will actually be written, so a save's blast
          radius is visible before committing to it. */}
      {changed && <span className="shrink-0 text-xs text-muted-foreground">{book.sequence ? `was #${book.sequence}` : 'unset'}</span>}
    </div>
  )
}

/** Reads this series' sequence off a list item; see `sequenceFor` in SeriesPage. */
function toSeriesBook(item: LibraryItemMinified, seriesId: string): SeriesBook {
  const series = item.mediaType === 'book' ? (item.media.metadata as { series?: SeriesRef | SeriesRef[] }).series : undefined
  const refs = series ? (Array.isArray(series) ? series : [series]) : []
  return {
    id: item.id,
    title: item.media.metadata.title ?? 'Untitled',
    sequence: refs.find((s) => s.id === seriesId)?.sequence ?? null
  }
}

/**
 * The editor body. Split out so it mounts fresh each time the dialog opens
 * (Radix unmounts closed content), which lets the initial order come from a
 * `useState` initialiser rather than an effect that syncs state from props —
 * a cancelled edit then leaves nothing behind with no reset logic at all.
 */
function SeriesOrderForm({ seriesId, books, onDone }: { seriesId: string; books: LibraryItemMinified[]; onDone: () => void }) {
  const [order, setOrder] = useState<SeriesBook[]>(() => books.map((item) => toSeriesBook(item, seriesId)))
  const reorder = useReorderSeries(seriesId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrder((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id)
      const newIndex = prev.findIndex((b) => b.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  async function onSave() {
    try {
      const result = await reorder.mutateAsync(order.map((b) => b.id))
      toast.success(result.updated === 0 ? 'Order already up to date' : `Updated ${result.updated} book${result.updated === 1 ? '' : 's'}`)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that order')
    }
  }

  const pendingCount = order.filter((b, i) => (b.sequence ?? '') !== sequenceForPosition(i)).length

  return (
    <>
      <DialogDescription>Drag to arrange. Saving numbers the books 1 to {order.length} in this order.</DialogDescription>

      <ScrollArea className="max-h-[55vh] pr-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {order.map((book, index) => (
                <SortableRow key={book.id} book={book} position={index} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="text-xs text-muted-foreground">{pendingCount === 0 ? 'No changes' : `${pendingCount} book${pendingCount === 1 ? '' : 's'} will change`}</span>
        <Button onClick={() => void onSave()} disabled={reorder.isPending || pendingCount === 0} className="gap-1.5">
          {reorder.isPending && <Spinner variant="ring" size={14} />}
          Save order
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Drag-to-reorder editor for a series' reading order (lane C2).
 *
 * Assigns positions 1..N from the visible order. The heavy lifting — reading
 * each book's other series memberships so they survive the write — lives in
 * `useReorderSeries`; see the note there on why that read is mandatory.
 */
export function SeriesOrderDialog({ seriesId, seriesName, books }: { seriesId: string; seriesName: string; books: LibraryItemMinified[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ListOrdered className="size-4" />
          Edit order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reading order — {seriesName}</DialogTitle>
        </DialogHeader>
        <SeriesOrderForm seriesId={seriesId} books={books} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
