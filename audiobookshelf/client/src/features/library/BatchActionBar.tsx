import { toast } from 'sonner'
import { Check, CircleOff, FolderHeart, ListMusic, Tags, Trash2, X } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { useBatchDeleteItems, useBatchMarkFinished, useBatchMarkUnread } from '@/hooks/use-batch'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/kibo-ui/spinner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { BatchAddToCollectionDialog } from './BatchAddToCollectionDialog'
import { BatchAddToPlaylistDialog } from './BatchAddToPlaylistDialog'
import { BatchEditTagsDialog } from './BatchEditTagsDialog'
import type { LibraryItemMinified } from '@/types/abs'

export function BatchActionBar({ selectedItems, onClearSelection }: { selectedItems: LibraryItemMinified[]; onClearSelection: () => void }) {
  const isAdmin = useAuthStore((s) => s.user?.type === 'root' || s.user?.type === 'admin')
  const canDelete = useAuthStore((s) => Boolean(s.user?.permissions.delete))

  const itemIds = selectedItems.map((i) => i.id)
  const markFinished = useBatchMarkFinished()
  const markUnread = useBatchMarkUnread()
  const deleteItems = useBatchDeleteItems()

  if (itemIds.length === 0) return null

  async function onMarkFinished() {
    try {
      await markFinished.mutateAsync(itemIds)
      toast.success(`Marked ${itemIds.length} book${itemIds.length === 1 ? '' : 's'} as finished`)
      onClearSelection()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update those books')
    }
  }

  async function onMarkUnread() {
    try {
      await markUnread.mutateAsync(itemIds)
      toast.success(`Marked ${itemIds.length} book${itemIds.length === 1 ? '' : 's'} as unread`)
      onClearSelection()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update those books')
    }
  }

  async function onDelete() {
    try {
      await deleteItems.mutateAsync(itemIds)
      toast.success(`Deleted ${itemIds.length} book${itemIds.length === 1 ? '' : 's'}`)
      onClearSelection()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete those books')
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[120rem] flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <Button variant="ghost" size="sm" onClick={onClearSelection} className="gap-1.5 text-muted-foreground">
          <X className="size-4" />
          {itemIds.length} selected
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <BatchAddToPlaylistDialog
            itemIds={itemIds}
            onDone={onClearSelection}
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                <ListMusic className="size-4" />
                Playlist
              </Button>
            }
          />

          {isAdmin && (
            <BatchAddToCollectionDialog
              itemIds={itemIds}
              onDone={onClearSelection}
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FolderHeart className="size-4" />
                  Collection
                </Button>
              }
            />
          )}

          {isAdmin && (
            <BatchEditTagsDialog
              items={selectedItems}
              onDone={onClearSelection}
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Tags className="size-4" />
                  Tags
                </Button>
              }
            />
          )}

          <Button variant="outline" size="sm" onClick={() => void onMarkFinished()} disabled={markFinished.isPending} className="gap-1.5">
            {markFinished.isPending ? <Spinner variant="ring" size={14} /> : <Check className="size-4" />}
            Finished
          </Button>

          <Button variant="outline" size="sm" onClick={() => void onMarkUnread()} disabled={markUnread.isPending} className="gap-1.5">
            {markUnread.isPending ? <Spinner variant="ring" size={14} /> : <CircleOff className="size-4" />}
            Unread
          </Button>

          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {itemIds.length} book{itemIds.length === 1 ? '' : 's'}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>This removes them from the library and database. The files on disk aren't touched unless a hard delete is requested — this isn't one.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  )
}
