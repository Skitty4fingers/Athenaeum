import { Bookmark, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { formatClock } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBookmarksForItem, useCreateBookmark, useDeleteBookmark } from '@/hooks/use-bookmarks'
import { usePlayerStore } from '@/stores/player'

export function BookmarksMenu({ iconClassName = 'size-4', buttonClassName }: { iconClassName?: string; buttonClassName?: string }) {
  const item = usePlayerStore((s) => s.item)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const seek = usePlayerStore((s) => s.seek)

  const { data: bookmarks } = useBookmarksForItem(item?.id)
  const createBookmark = useCreateBookmark(item?.id ?? '')
  const deleteBookmark = useDeleteBookmark(item?.id ?? '')

  if (!item) return null

  async function addBookmark() {
    try {
      // Whole seconds — the server's dedup key is (libraryItemId, time), and
      // sub-second precision here would just make near-identical bookmarks
      // fail to collapse into one.
      await createBookmark.mutateAsync({ time: Math.floor(currentTime), title: formatClock(currentTime) })
      toast.success('Bookmark added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that bookmark')
    }
  }

  async function removeBookmark(time: number) {
    try {
      await deleteBookmark.mutateAsync(time)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that bookmark')
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Bookmarks" className={cn('relative', buttonClassName)}>
          <Bookmark className={iconClassName} />
          {!!bookmarks?.length && <span className="absolute -bottom-0.5 right-0.5 rounded bg-primary px-0.5 text-[9px] font-semibold leading-tight text-primary-foreground">{bookmarks.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <button type="button" onClick={() => void addBookmark()} disabled={createBookmark.isPending} className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-accent/60 disabled:opacity-50">
          <Plus className="size-4" />
          Bookmark this moment — {formatClock(currentTime)}
        </button>

        {bookmarks?.length ? (
          <ScrollArea className="max-h-80 scrollbar-slim">
            <div className="p-1">
              {bookmarks.map((bookmark) => (
                <div key={bookmark.time} className="group flex items-center gap-1 rounded-md px-1 transition-colors hover:bg-accent/60">
                  <button type="button" onClick={() => seek(bookmark.time)} className="flex flex-1 items-center justify-between gap-2 py-1.5 pl-1 text-left text-sm">
                    <span className="min-w-0 flex-1 truncate">{bookmark.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatClock(bookmark.time)}</span>
                  </button>
                  <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100" onClick={() => void removeBookmark(bookmark.time)} aria-label={`Remove bookmark ${bookmark.title}`}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">No bookmarks yet.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
