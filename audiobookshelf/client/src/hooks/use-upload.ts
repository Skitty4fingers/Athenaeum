import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withSequenceForSeries } from '@/lib/series'
import type { BookSeriesRef, LibraryItemsPage } from '@/types/abs'

export interface UploadInput {
  libraryId: string
  folderId: string
  title: string
  author?: string
  series?: string
  /** Position within `series`, e.g. "2". Ignored when no series is given. */
  sequence?: string
  files: File[]
}

export interface UploadResult {
  /**
   * Whether the requested series position was written.
   * `null` when none was asked for; `false` when the upload landed but the
   * scanned item could not be found in time to write it.
   */
  sequenceApplied: boolean | null
}

/** How long to wait for the server's watcher to scan a freshly uploaded book. */
const SCAN_WAIT_MS = 40_000
const SCAN_POLL_MS = 2_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Waits for a just-uploaded book to appear in the library.
 *
 * `POST /upload` returns no item — the server writes files to disk and its
 * filesystem watcher scans them in some seconds later. Newest-first by
 * `addedAt` puts the new item on the first page regardless of library size.
 */
async function findScannedItem(libraryId: string, title: string): Promise<string | null> {
  const deadline = Date.now() + SCAN_WAIT_MS
  const wanted = title.trim().toLowerCase()

  while (Date.now() < deadline) {
    await sleep(SCAN_POLL_MS)
    try {
      const page = await api.get<LibraryItemsPage>(`/libraries/${libraryId}/items?limit=25&minified=1&sort=addedAt&desc=1`)
      const match = page.results.find((item) => (item.media.metadata.title ?? '').trim().toLowerCase() === wanted)
      if (match) return match.id
    } catch {
      // Keep polling — a transient failure mid-scan should not abandon the wait.
    }
  }
  return null
}

/**
 * `POST /upload` (`server/controllers/MiscController.js`). The server builds
 * the destination folder itself from title/author/series — `author/series/title`
 * for a book library — so this only ever hands over the raw pieces, not a path.
 * No response body on success; the actual library item shows up once the
 * server's filesystem watcher notices the new files and scans them in.
 *
 * The upload endpoint has no concept of a series *position*: `series` is only
 * a folder-path component, so an uploaded book lands in its series with
 * `sequence: null` and sorts arbitrarily (verified against a running server).
 * When the user supplies one, this waits for the scan and PATCHes it onto the
 * item afterwards — the same write the item editor performs. If the scan takes
 * longer than expected the upload still stands and the caller is told the
 * position was not applied, rather than the number being silently dropped.
 */
export function useUploadItem() {
  const queryClient = useQueryClient()
  return useMutation<UploadResult, Error, UploadInput>({
    mutationFn: async (input) => {
      const formData = new FormData()
      formData.set('library', input.libraryId)
      formData.set('folder', input.folderId)
      formData.set('title', input.title)
      if (input.author) formData.set('author', input.author)
      if (input.series) formData.set('series', input.series)
      input.files.forEach((file) => formData.append(file.name, file))
      await api.post('/upload', formData)

      const sequence = input.sequence?.trim()
      if (!input.series || !sequence) return { sequenceApplied: null }

      const itemId = await findScannedItem(input.libraryId, input.title)
      if (!itemId) return { sequenceApplied: false }

      // Read the item back before writing: the server replaces a book's series
      // list wholesale, so the payload must carry every series it belongs to.
      // A fresh upload has exactly one, but reading keeps this correct if that
      // ever stops being true (see useReorderSeries for the same constraint).
      const item = await api.get<{ media?: { metadata?: { series?: BookSeriesRef[] } } }>(`/items/${itemId}?expanded=1`)
      const existing = item.media?.metadata?.series ?? []
      // Matched by name, not id: the series may have been created by this very
      // scan, so the only handle we have is what the user typed.
      const target = input.series.trim().toLowerCase()
      const series = existing.length ? withSequenceForSeries(existing, (s) => s.name.trim().toLowerCase() === target, sequence) : [{ name: input.series.trim(), sequence }]

      await api.patch(`/items/${itemId}/media`, { metadata: { series } })
      return { sequenceApplied: true }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library-items'] })
      void queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['library-series'] })
      void queryClient.invalidateQueries({ queryKey: ['series-books'] })
    }
  })
}
