import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Library, LibrarySettings } from '@/types/abs'

/**
 * Library folder and settings management.
 *
 * PATCH /api/libraries/:id has a sharp edge worth knowing before touching it:
 * it treats `folders` as the *complete* desired set. Any existing folder whose
 * id isn't present in the submitted array gets removed — along with every
 * library item under it (see server/controllers/LibraryController.js). Every
 * mutation below always sends the full current folder list plus the change,
 * never a partial one.
 */

function invalidateLibrary(queryClient: ReturnType<typeof useQueryClient>, libraryId: string) {
  void queryClient.invalidateQueries({ queryKey: ['libraries'] })
  void queryClient.invalidateQueries({ queryKey: ['library-items', libraryId] })
  void queryClient.invalidateQueries({ queryKey: ['library-stats', libraryId] })
  void queryClient.invalidateQueries({ queryKey: ['library-filterdata', libraryId] })
}

interface AddFolderArgs {
  library: Library
  path: string
}

export function useAddLibraryFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ library, path }: AddFolderArgs) =>
      api.patch<Library>(`/libraries/${library.id}`, {
        // Existing folders travel by id (unchanged); the new one has no id yet.
        folders: [...library.folders.map((f) => ({ id: f.id })), { path }]
      }),
    onSuccess: (_data, { library }) => invalidateLibrary(queryClient, library.id)
  })
}

interface RemoveFolderArgs {
  library: Library
  folderId: string
}

export function useRemoveLibraryFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ library, folderId }: RemoveFolderArgs) =>
      api.patch<Library>(`/libraries/${library.id}`, {
        folders: library.folders.filter((f) => f.id !== folderId).map((f) => ({ id: f.id }))
      }),
    onSuccess: (_data, { library }) => invalidateLibrary(queryClient, library.id)
  })
}

export function useUpdateMetadataPrecedence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ libraryId, metadataPrecedence }: { libraryId: string; metadataPrecedence: LibrarySettings['metadataPrecedence'] }) =>
      api.patch<Library>(`/libraries/${libraryId}`, { settings: { metadataPrecedence } }),
    onSuccess: (_data, { libraryId }) => invalidateLibrary(queryClient, libraryId)
  })
}

export function useTriggerScan() {
  return useMutation({
    mutationFn: ({ libraryId, force = false }: { libraryId: string; force?: boolean }) => api.post(`/libraries/${libraryId}/scan${force ? '?force=1' : ''}`)
    // No cache invalidation here — the scan runs async on the server and this
    // call just returns "started". The real invalidation happens in
    // useLibraryScanStatus when the socket reports task_finished.
  })
}

/**
 * Persists to `settings.markAsFinishedTimeRemaining` — a book auto-marks
 * finished once fewer than this many seconds remain (see
 * server/models/MediaProgress.js#applyProgressUpdate, applied on every
 * progress sync). Default upstream is 10 seconds; this is the one lever that
 * controls it, so it lives alongside the other library settings rather than
 * being reimplemented client-side.
 */
export function useUpdateFinishThreshold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ libraryId, markAsFinishedTimeRemaining }: { libraryId: string; markAsFinishedTimeRemaining: number }) => api.patch<Library>(`/libraries/${libraryId}`, { settings: { markAsFinishedTimeRemaining } }),
    onSuccess: (_data, { libraryId }) => invalidateLibrary(queryClient, libraryId)
  })
}
