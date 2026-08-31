import { Link } from 'react-router-dom'
import { ArrowLeft, FolderHeart } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary } from '@/hooks/use-library'
import { useCollections } from '@/hooks/use-collections'
import { coverUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Collection } from '@/types/abs'

function CollectionCard({ collection }: { collection: Collection }) {
  const covers = collection.books.slice(0, 4)

  return (
    <Link to={`/collections/${collection.id}`} className="group flex flex-col gap-2.5">
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl border bg-muted shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/20">
        {covers.length ? (
          covers.map((item) => <img key={item.id} src={coverUrl(item.id, { width: 200 })} alt="" className="aspect-square w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />)
        ) : (
          <div className="col-span-2 row-span-2 flex aspect-square items-center justify-center bg-gradient-to-br from-muted to-accent">
            <FolderHeart className="size-8 text-muted-foreground/50" />
          </div>
        )}
        {Array.from({ length: Math.max(0, 4 - covers.length) }).map((_, i) => (
          <div key={i} className="aspect-square bg-muted" />
        ))}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{collection.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {collection.books.length} book{collection.books.length === 1 ? '' : 's'}
        </p>
      </div>
    </Link>
  )
}

export function CollectionsPage() {
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)
  const { data: collections, isPending } = useCollections(library?.id)

  return (
    <div className="mx-auto w-full max-w-[120rem] px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6 flex items-center gap-2.5">
        <FolderHeart className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>
      </div>

      {isPending && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      )}

      {collections && collections.length === 0 && <p className="text-sm text-muted-foreground">No collections yet — add a book to a new one from its item page.</p>}

      {!!collections?.length && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {collections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </div>
  )
}
