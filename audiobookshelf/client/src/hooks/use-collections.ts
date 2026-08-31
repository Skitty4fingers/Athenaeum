import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Collection } from '@/types/abs'

/**
 * `server/controllers/CollectionController.js`. Shared library shelves —
 * creating one or changing membership requires `canUpdate` (admin/root by
 * default), enforced server-side; the UI gates the entry points the same way
 * rather than only catching the resulting 403.
 */
export function useCollections(libraryId: string | undefined) {
  return useQuery({
    queryKey: ['collections', libraryId],
    enabled: Boolean(libraryId),
    queryFn: () => api.get<{ results: Collection[] }>(`/libraries/${libraryId}/collections`),
    select: (data) => data.results
  })
}

export function useCollection(collectionId: string | undefined) {
  return useQuery({
    queryKey: ['collection', collectionId],
    enabled: Boolean(collectionId),
    queryFn: () => api.get<Collection>(`/collections/${collectionId}`)
  })
}

function invalidateCollection(queryClient: ReturnType<typeof useQueryClient>, collectionId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['collections'] })
  if (collectionId) void queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
}

/** Collections can't be created empty server-side, so this always seeds one book. */
export function useCreateCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { libraryId: string; name: string; description?: string; bookId: string }) => api.post<Collection>('/collections', { libraryId: input.libraryId, name: input.name, description: input.description, books: [input.bookId] }),
    onSuccess: () => invalidateCollection(queryClient)
  })
}

export function useUpdateCollection(collectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string; description?: string }) => api.patch<Collection>(`/collections/${collectionId}`, input),
    onSuccess: () => invalidateCollection(queryClient, collectionId)
  })
}

/** Full replace — `bookIds` is the complete desired order of every book already in the collection. */
export function useReorderCollection(collectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (bookIds: string[]) => api.patch<Collection>(`/collections/${collectionId}`, { books: bookIds }),
    onSuccess: () => invalidateCollection(queryClient, collectionId)
  })
}

export function useAddBookToCollection(collectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemId: string) => api.post<Collection>(`/collections/${collectionId}/book`, { id: libraryItemId }),
    onSuccess: () => invalidateCollection(queryClient, collectionId)
  })
}

/**
 * The `:bookId` route param is misnamed server-side (a documented TODO) — it
 * actually expects a libraryItemId, same as everywhere else.
 */
export function useRemoveBookFromCollection(collectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemId: string) => api.delete<Collection>(`/collections/${collectionId}/book/${libraryItemId}`),
    onSuccess: () => invalidateCollection(queryClient, collectionId)
  })
}

export function useDeleteCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (collectionId: string) => api.delete(`/collections/${collectionId}`),
    onSuccess: () => invalidateCollection(queryClient)
  })
}
