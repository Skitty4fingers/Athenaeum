import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Layers, Mic, Tag, User } from 'lucide-react'

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary, useLibrarySearch } from '@/hooks/use-library'
import { encodeFilter } from '@/lib/filters'
import { coverUrl } from '@/lib/api'

/**
 * Global ⌘K / Ctrl+K search. This is real search over the library — books,
 * authors, narrators, series, genres — not a static jump-list. Theme
 * switching lives only in the header's ThemeSwitcher now; duplicating it here
 * as an always-visible group is what made this feel like a settings menu
 * instead of a search box.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)

  const trimmed = query.trim()
  const { data: results, isFetching } = useLibrarySearch(library?.id, trimmed)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Start clean every time the palette opens, rather than showing a stale query.
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  function goToFilter(group: 'genres' | 'narrators', value: string) {
    run(() => navigate(`/library?filter=${encodeURIComponent(encodeFilter(group, value))}`))
  }

  function goToAuthor(authorId: string) {
    run(() => navigate(`/author/${authorId}`))
  }

  const books = useMemo(() => [...(results?.book ?? []), ...(results?.podcast ?? [])].slice(0, 8), [results])
  const hasAnyMatch = books.length > 0 || !!results?.authors?.length || !!results?.narrators?.length || !!results?.series?.length || !!results?.genres?.length

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search your library by title, author, narrator, series, or genre">
      <CommandInput placeholder="Search titles, authors, narrators…" value={query} onValueChange={setQuery} />
      <CommandList>
        {trimmed.length > 0 && trimmed.length < 2 && <p className="py-6 text-center text-sm text-muted-foreground">Keep typing…</p>}

        {trimmed.length >= 2 && !isFetching && !hasAnyMatch && <CommandEmpty>No results for "{trimmed}"</CommandEmpty>}

        {books.length > 0 && (
          <CommandGroup heading="Books">
            {books.map(({ libraryItem }) => (
              <CommandItem key={libraryItem.id} value={`book-${libraryItem.id}-${libraryItem.media.metadata.title ?? ''}`} onSelect={() => run(() => navigate(`/item/${libraryItem.id}`))} className="gap-2.5">
                <img src={coverUrl(libraryItem.id, { width: 48 })} alt="" className="size-8 shrink-0 rounded object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <div className="min-w-0">
                  <p className="truncate">{libraryItem.media.metadata.title ?? 'Untitled'}</p>
                  {libraryItem.mediaType === 'book' && 'authorName' in libraryItem.media.metadata && <p className="truncate text-xs text-muted-foreground">{libraryItem.media.metadata.authorName}</p>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!!results?.authors?.length && (
          <CommandGroup heading="Authors">
            {results.authors.map((author) => (
              <CommandItem key={author.id} value={`author-${author.id}-${author.name}`} onSelect={() => goToAuthor(author.id)}>
                <User className="size-4" />
                {author.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {author.numBooks} book{author.numBooks === 1 ? '' : 's'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!!results?.narrators?.length && (
          <CommandGroup heading="Narrators">
            {results.narrators.map((narrator) => (
              <CommandItem key={narrator.name} value={`narrator-${narrator.name}`} onSelect={() => goToFilter('narrators', narrator.name)}>
                <Mic className="size-4" />
                {narrator.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {narrator.numBooks} book{narrator.numBooks === 1 ? '' : 's'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!!results?.series?.length && (
          <CommandGroup heading="Series">
            {results.series.map(({ series, books: seriesBooks }) => (
              <CommandItem key={series.id} value={`series-${series.id}-${series.name}`} onSelect={() => run(() => navigate(`/series/${series.id}`))}>
                <Layers className="size-4" />
                {series.name}
                <span className="ml-auto text-xs text-muted-foreground">{seriesBooks?.length ?? 0} books</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!!results?.genres?.length && (
          <CommandGroup heading="Genres">
            {results.genres.map((genre) => (
              <CommandItem key={genre.name} value={`genre-${genre.name}`} onSelect={() => goToFilter('genres', genre.name)}>
                <Tag className="size-4" />
                {genre.name}
                <span className="ml-auto text-xs text-muted-foreground">{genre.numItems}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!trimmed && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <BookOpen className="size-5" />
            Start typing to search your library
          </div>
        )}
      </CommandList>
    </CommandDialog>
  )
}
