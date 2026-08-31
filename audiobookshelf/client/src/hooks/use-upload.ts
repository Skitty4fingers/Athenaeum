import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface UploadInput {
  libraryId: string
  folderId: string
  title: string
  author?: string
  series?: string
  files: File[]
}

/**
 * `POST /upload` (`server/controllers/MiscController.js`). The server builds
 * the destination folder itself from title/author/series — `author/series/title`
 * for a book library — so this only ever hands over the raw pieces, not a path.
 * No response body on success; the actual library item shows up once the
 * server's filesystem watcher notices the new files and scans them in, which
 * this can't wait on directly.
 */
export function useUploadItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadInput) => {
      const formData = new FormData()
      formData.set('library', input.libraryId)
      formData.set('folder', input.folderId)
      formData.set('title', input.title)
      if (input.author) formData.set('author', input.author)
      if (input.series) formData.set('series', input.series)
      input.files.forEach((file) => formData.append(file.name, file))
      await api.post('/upload', formData)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library-items'] })
      void queryClient.invalidateQueries({ queryKey: ['library-stats'] })
    }
  })
}
