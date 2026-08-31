import { useState } from 'react'
import { toast } from 'sonner'
import { Check, ListMusic, Plus } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary } from '@/hooks/use-library'
import { useAddItemToPlaylist, useCreatePlaylist, usePlaylists, useRemoveItemFromPlaylist } from '@/hooks/use-playlists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Spinner } from '@/components/kibo-ui/spinner'
import type { Playlist } from '@/types/abs'

function PlaylistRow({ playlist, itemId }: { playlist: Playlist; itemId: string }) {
  const isMember = playlist.items.some((i) => i.libraryItemId === itemId)
  const addItem = useAddItemToPlaylist(playlist.id)
  const removeItem = useRemoveItemFromPlaylist(playlist.id)
  const isPending = addItem.isPending || removeItem.isPending

  async function toggle() {
    try {
      if (isMember) await removeItem.mutateAsync(itemId)
      else await addItem.mutateAsync(itemId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update that playlist')
    }
  }

  return (
    <button type="button" onClick={() => void toggle()} disabled={isPending} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60 disabled:opacity-50">
      <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${isMember ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>{isPending ? <Spinner variant="ring" size={11} /> : isMember && <Check className="size-3.5" />}</div>
      <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {playlist.items.length} item{playlist.items.length === 1 ? '' : 's'}
      </span>
    </button>
  )
}

export function AddToPlaylistDialog({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)
  const { data: playlists } = usePlaylists(library?.id)
  const createPlaylist = useCreatePlaylist()

  async function createNew(e: React.FormEvent) {
    e.preventDefault()
    if (!library || !newName.trim()) return
    try {
      await createPlaylist.mutateAsync({ libraryId: library.id, name: newName.trim(), libraryItemId: itemId })
      toast.success('Playlist created')
      setNewName('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create that playlist')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <ListMusic className="size-4" />
          Add to playlist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
        </DialogHeader>

        {!!playlists?.length && (
          <div className="-mx-1.5 max-h-64 space-y-0.5 overflow-y-auto">
            {playlists.map((playlist) => (
              <PlaylistRow key={playlist.id} playlist={playlist} itemId={itemId} />
            ))}
          </div>
        )}
        {!playlists?.length && <p className="text-sm text-muted-foreground">No playlists yet — create the first one below.</p>}

        <form onSubmit={createNew} className="flex items-end gap-2 border-t pt-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-playlist-name">New playlist</Label>
            <Input id="new-playlist-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Road trip" disabled={createPlaylist.isPending} />
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
