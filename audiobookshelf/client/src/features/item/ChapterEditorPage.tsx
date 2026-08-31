import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { api, coverUrl } from '@/lib/api'
import { formatClock } from '@/lib/format'
import { useAuthStore } from '@/stores/auth'
import { useUpdateChapters } from '@/hooks/use-chapters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/kibo-ui/spinner'
import type { Chapter } from '@/stores/player'
import type { BookMediaMinified, LibraryItemMinified } from '@/types/abs'

interface ExpandedItem extends LibraryItemMinified {
  media: BookMediaMinified & { chapters: Chapter[] }
}

function useChapterItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['item', itemId],
    enabled: Boolean(itemId),
    queryFn: () => api.get<ExpandedItem>(`/items/${itemId}?expanded=1`)
  })
}

/** "1:23:45" / "23:45" / "45" -> seconds. Returns null for anything unparseable. */
function parseClock(text: string): number | null {
  const parts = text
    .trim()
    .split(':')
    .map((p) => p.trim())
  if (!parts.length || parts.some((p) => p === '' || Number.isNaN(Number(p)))) return null
  const nums = parts.map(Number)
  const [h, m, s] = nums.length === 3 ? nums : nums.length === 2 ? [0, ...nums] : [0, 0, nums[0]]
  return h * 3600 + m * 60 + s
}

interface EditableChapter {
  title: string
  /** Kept as text while editing so an in-progress "1:2" isn't clobbered by reformatting. */
  startText: string
}

/**
 * Chapters are edited as title + start time only — end times are derived
 * (each chapter ends where the next begins; the last ends at the book's
 * duration) rather than asked for directly. Audiobook chapters are always
 * contiguous in practice, and asking for both start and end invites gaps or
 * overlaps that this sidesteps entirely.
 */
export function ChapterEditorPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.type === 'root' || user?.type === 'admin'

  const { data: item, isPending, isError } = useChapterItem(itemId)
  const updateChapters = useUpdateChapters(itemId)

  const [chapters, setChapters] = useState<EditableChapter[] | null>(null)

  useEffect(() => {
    if (item && !chapters) {
      setChapters(item.media.chapters.map((c) => ({ title: c.title, startText: formatClock(c.start) })))
    }
  }, [item, chapters])

  if (!isAdmin) return <Navigate to={itemId ? `/item/${itemId}` : '/'} replace />

  if (isPending || !chapters) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (isError || !item) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center">
        <p className="font-medium">Couldn't load this book</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Back to library</Link>
        </Button>
      </div>
    )
  }

  const duration = item.media.duration

  function update(index: number, patch: Partial<EditableChapter>) {
    setChapters((prev) => prev!.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  function remove(index: number) {
    setChapters((prev) => prev!.filter((_, i) => i !== index))
  }

  function move(index: number, direction: -1 | 1) {
    setChapters((prev) => {
      const next = [...prev!]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function addAfter(index: number) {
    setChapters((prev) => {
      const next = [...prev!]
      const anchor = parseClock(next[index]?.startText ?? '0:00') ?? 0
      const following = parseClock(next[index + 1]?.startText ?? '') ?? duration
      const midpoint = anchor + (following - anchor) / 2
      next.splice(index + 1, 0, { title: 'New Chapter', startText: formatClock(midpoint) })
      return next
    })
  }

  // Every row's start must parse and the list must stay in non-decreasing
  // order — the server has no way to represent (and would silently produce
  // nonsense from) an out-of-order or unparseable chapter list.
  const parsedStarts = chapters.map((c) => parseClock(c.startText))
  const hasInvalidTime = parsedStarts.some((s) => s === null || s < 0 || s > duration)
  const isOutOfOrder = parsedStarts.some((s, i) => i > 0 && s !== null && parsedStarts[i - 1] !== null && s < parsedStarts[i - 1]!)
  const canSave = chapters.length > 0 && !hasInvalidTime && !isOutOfOrder && chapters.every((c) => c.title.trim())

  async function onSave() {
    if (!canSave) return
    const starts = parsedStarts as number[]
    const payload = chapters!.map((c, i) => ({
      title: c.title.trim(),
      start: starts[i],
      end: i < starts.length - 1 ? starts[i + 1] : duration
    }))
    try {
      await updateChapters.mutateAsync(payload)
      toast.success('Chapters saved')
      navigate(`/item/${itemId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save chapters')
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to={`/item/${itemId}`}>
          <ArrowLeft className="size-4" />
          Cancel
        </Link>
      </Button>

      <div className="mb-6 flex items-center gap-4">
        <img src={coverUrl(item.id, { width: 96, ts: item.updatedAt })} alt="" className="size-16 shrink-0 rounded-md border object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Edit chapters</h1>
          <p className="truncate text-sm text-muted-foreground">
            {item.media.metadata.title} · {chapters.length} chapter{chapters.length === 1 ? '' : 's'} · {formatClock(duration)} total
          </p>
        </div>
      </div>

      {isOutOfOrder && <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Chapter start times must increase down the list.</p>}

      <div className="space-y-1.5">
        {chapters.map((chapter, index) => {
          const parsed = parsedStarts[index]
          const invalid = parsed === null || parsed < 0 || parsed > duration
          return (
            <div key={index} className="flex items-center gap-1.5">
              <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <Input value={chapter.title} onChange={(e) => update(index, { title: e.target.value })} placeholder="Chapter title" className="flex-1" />
              <Input value={chapter.startText} onChange={(e) => update(index, { startText: e.target.value })} placeholder="0:00" aria-invalid={invalid} className="w-24 shrink-0 font-mono text-sm aria-invalid:border-destructive" />
              <Button type="button" variant="ghost" size="icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="size-7 shrink-0">
                <ArrowUp className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => move(index, 1)} disabled={index === chapters.length - 1} aria-label="Move down" className="size-7 shrink-0">
                <ArrowDown className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => addAfter(index)} aria-label="Insert chapter after" className="size-7 shrink-0 text-muted-foreground">
                <Plus className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove chapter" className="size-7 shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        })}
      </div>

      {chapters.length === 0 && (
        <Button type="button" variant="outline" size="sm" onClick={() => setChapters([{ title: 'Chapter 1', startText: '0:00' }])} className="gap-1.5">
          <Plus className="size-3.5" />
          Add a chapter
        </Button>
      )}

      <div className="mt-6 flex items-center gap-3 border-t pt-5">
        <Button onClick={() => void onSave()} disabled={!canSave || updateChapters.isPending} className="gap-1.5">
          {updateChapters.isPending && <Spinner variant="ring" size={14} />}
          Save
        </Button>
        <Button asChild variant="ghost">
          <Link to={`/item/${itemId}`}>Cancel</Link>
        </Button>
      </div>
    </div>
  )
}
