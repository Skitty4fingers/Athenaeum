import { useState } from 'react'
import { toast } from 'sonner'
import { ListMusic, Plus } from 'lucide-react'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary } from '@/hooks/use-library'
import { usePlaylists, useCreatePlaylist } from '@/hooks/use-playlists'
import { useBatchAddToPlaylist } from '@/hooks/use-batch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Spinner } from '@/components/kibo-ui/spinner'

function PlaylistAddRow({ playlistId, name, itemCount, itemIds, onDone }: { playlistId: string; name: string; itemCount: number; itemIds: string[]; onDone: () => void }) {
  const addBatch = useBatchAddToPlaylist(playlistId)

  async function add() {
    try {
      await addBatch.mutateAsync(itemIds)
      toast.success(`Added ${itemIds.length} book${itemIds.length === 1 ? '' : 's'} to "${name}"`)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add to that playlist')
    }
  }

  return (
    <button type="button" onClick={() => void add()} disabled={addBatch.isPending} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60 disabled:opacity-50">
      <ListMusic className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {addBatch.isPending ? <Spinner variant="ring" size={13} /> : <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{itemCount} books</span>}
    </button>
  )
}

export function BatchAddToPlaylistDialog({ itemIds, trigger, onDone }: { itemIds: string[]; trigger: React.ReactNode; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)
  const { data: playlists } = usePlaylists(library?.id)
  const createPlaylist = useCreatePlaylist()

  async function createNewAndAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!library || !newName.trim() || itemIds.length === 0) return
    try {
      const [firstId, ...rest] = itemIds
      const created = await createPlaylist.mutateAsync({ libraryId: library.id, name: newName.trim(), libraryItemId: firstId })
      if (rest.length) await api.post(`/playlists/${created.id}/batch/add`, { items: rest.map((libraryItemId) => ({ libraryItemId })) })
      toast.success(`Playlist created with ${itemIds.length} book${itemIds.length === 1 ? '' : 's'}`)
      setNewName('')
      setOpen(false)
      onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create that playlist')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Add {itemIds.length} book{itemIds.length === 1 ? '' : 's'} to playlist
          </DialogTitle>
        </DialogHeader>

        {!!playlists?.length && (
          <div className="-mx-1.5 max-h-64 space-y-0.5 overflow-y-auto">
            {playlists.map((playlist) => (
              <PlaylistAddRow
                key={playlist.id}
                playlistId={playlist.id}
                name={playlist.name}
                itemCount={playlist.items.length}
                itemIds={itemIds}
                onDone={() => {
                  setOpen(false)
                  onDone?.()
                }}
              />
            ))}
          </div>
        )}
        {!playlists?.length && <p className="text-sm text-muted-foreground">No playlists yet — create the first one below.</p>}

        <form onSubmit={createNewAndAdd} className="flex items-end gap-2 border-t pt-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="batch-new-playlist-name">New playlist</Label>
            <Input id="batch-new-playlist-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Road trip" disabled={createPlaylist.isPending} />
          </div>
          <Button type="submit" disabled={!newName.trim() || createPlaylist.isPending} className="gap-1.5">
            {createPlaylist.isPending ? <Spinner variant="ring" size={14} /> : <Plus className="size-4" />}
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
