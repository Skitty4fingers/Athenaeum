import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, User } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useAuthor } from '@/hooks/use-author'
import { authorImageUrl } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BookCard, BookCardSkeleton } from '@/features/library/BookCard'
import type { BookMediaMinified } from '@/types/abs'

const GRID_CLASS = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'

export function AuthorPage() {
  const { authorId } = useParams<{ authorId: string }>()
  const user = useAuthStore((s) => s.user)
  const playItem = usePlayerStore((s) => s.play)
  const [imageFailed, setImageFailed] = useState(false)

  const { data: author, isPending, isError } = useAuthor(authorId)

  const progressByItem = useMemo(() => {
    const map = new Map<string, { progress: number; isFinished: boolean }>()
    for (const mp of user?.mediaProgress ?? []) {
      if (mp.episodeId) continue
      map.set(mp.libraryItemId, { progress: mp.progress, isFinished: mp.isFinished })
    }
    return map
  }, [user?.mediaProgress])

  const books = author?.libraryItems ?? []
  const totalDuration = useMemo(() => books.reduce((sum, item) => sum + ((item.media as BookMediaMinified).duration ?? 0), 0), [books])

  return (
    <div className="mx-auto w-full max-w-[120rem] px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      {isPending && (
        <div className="mb-8 flex items-start gap-5">
          <Skeleton className="size-32 shrink-0 rounded-full sm:size-40" />
          <div className="min-w-0 flex-1 space-y-2 pt-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-2/3 max-w-md" />
          </div>
        </div>
      )}

      {isError && <p className="text-sm text-muted-foreground">Couldn't load this author.</p>}

      {author && (
        <div className="mb-8 flex flex-col items-start gap-5 sm:flex-row">
          <div className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted sm:size-40">
            {author.imagePath && !imageFailed ? (
              <img src={authorImageUrl(author.id, { width: 320 })} alt="" className="size-full object-cover" onError={() => setImageFailed(true)} />
            ) : (
              <User className="size-12 text-muted-foreground/50" />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{author.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {books.length} book{books.length === 1 ? '' : 's'}
              {totalDuration > 0 && <> · {formatDuration(totalDuration)}</>}
            </p>
            {author.description && <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{author.description}</p>}
          </div>
        </div>
      )}

      {isPending && (
        <div className={GRID_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}

      {author && books.length === 0 && <p className="text-sm text-muted-foreground">No books by this author in the library.</p>}

      {books.length > 0 && (
        <div className={GRID_CLASS}>
          {books.map((item) => {
            const progress = progressByItem.get(item.id)
            return <BookCard key={item.id} item={item} progress={progress?.progress ?? 0} isFinished={progress?.isFinished ?? false} onPlay={(book) => void playItem(book)} />
          })}
        </div>
      )}
    </div>
  )
}
