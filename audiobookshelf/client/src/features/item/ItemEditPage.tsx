import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

import { api, coverUrl } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useUpdateItemMetadata } from '@/hooks/use-item-edit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/kibo-ui/spinner'
import { StringListEditor } from './StringListEditor'
import { SeriesEditor, type EditableSeries } from './SeriesEditor'
import type { BookMediaExpanded, LibraryItemMinified } from '@/types/abs'

type ExpandedBookItem = Omit<LibraryItemMinified, 'media'> & { media: BookMediaExpanded }

function useEditableItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['item', itemId],
    enabled: Boolean(itemId),
    queryFn: () => api.get<ExpandedBookItem>(`/items/${itemId}?expanded=1&include=progress`)
  })
}

interface FormState {
  title: string
  subtitle: string
  authors: string[]
  narrators: string[]
  series: EditableSeries[]
  genres: string[]
  tags: string[]
  publisher: string
  publishedYear: string
  publishedDate: string
  language: string
  isbn: string
  asin: string
  description: string
  explicit: boolean
  abridged: boolean
}

function toFormState(item: ExpandedBookItem): FormState {
  const meta = item.media.metadata
  return {
    title: meta.title ?? '',
    subtitle: meta.subtitle ?? '',
    authors: meta.authors.map((a) => a.name),
    narrators: [...meta.narrators],
    series: meta.series.map((s) => ({ name: s.name, sequence: s.sequence ?? '' })),
    genres: [...meta.genres],
    tags: [...item.media.tags],
    publisher: meta.publisher ?? '',
    publishedYear: meta.publishedYear ?? '',
    publishedDate: meta.publishedDate ?? '',
    language: meta.language ?? '',
    isbn: meta.isbn ?? '',
    asin: meta.asin ?? '',
    description: meta.description ?? '',
    explicit: meta.explicit,
    abridged: meta.abridged
  }
}

/** Field-level edit form — writes directly, unlike EnrichDialog's add/replace review. */
export function ItemEditPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.type === 'root' || user?.type === 'admin'

  const { data: item, isPending, isError } = useEditableItem(itemId)
  const updateMetadata = useUpdateItemMetadata(itemId)

  const [form, setForm] = useState<FormState | null>(null)

  // Seed the form once the item loads. Not re-seeded on every refetch, so an
  // in-progress edit does not get clobbered by a background revalidation.
  useEffect(() => {
    if (item && !form) setForm(toFormState(item))
  }, [item, form])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function onSave() {
    if (!form) return
    try {
      await updateMetadata.mutateAsync({
        metadata: {
          title: form.title.trim() || null,
          subtitle: form.subtitle.trim() || null,
          authors: form.authors.map((name) => ({ name })),
          narrators: form.narrators,
          series: form.series.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), sequence: s.sequence.trim() || null })),
          genres: form.genres,
          publisher: form.publisher.trim() || null,
          publishedYear: form.publishedYear.trim() || null,
          publishedDate: form.publishedDate.trim() || null,
          language: form.language.trim() || null,
          isbn: form.isbn.trim() || null,
          asin: form.asin.trim() || null,
          description: form.description.trim() || null,
          explicit: form.explicit,
          abridged: form.abridged
        },
        tags: form.tags
      })
      toast.success('Saved')
      navigate(`/item/${itemId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save changes')
    }
  }

  if (!isAdmin) return <Navigate to={itemId ? `/item/${itemId}` : '/'} replace />

  if (isPending || !form) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
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
          <h1 className="truncate text-xl font-semibold tracking-tight">Edit metadata</h1>
          <p className="truncate text-sm text-muted-foreground">{form.title || 'Untitled'}</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input id="subtitle" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
          </div>
        </div>

        <StringListEditor label="Authors" values={form.authors} onChange={(v) => set('authors', v)} placeholder="Add an author…" />
        <StringListEditor label="Narrators" values={form.narrators} onChange={(v) => set('narrators', v)} placeholder="Add a narrator…" />
        <SeriesEditor values={form.series} onChange={(v) => set('series', v)} />
        <StringListEditor label="Genres" values={form.genres} onChange={(v) => set('genres', v)} placeholder="Add a genre…" />
        <StringListEditor label="Tags" values={form.tags} onChange={(v) => set('tags', v)} placeholder="Add a tag…" />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="publisher">Publisher</Label>
            <Input id="publisher" value={form.publisher} onChange={(e) => set('publisher', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="publishedYear">Published year</Label>
            <Input id="publishedYear" value={form.publishedYear} onChange={(e) => set('publishedYear', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="publishedDate">Published date</Label>
            <Input id="publishedDate" value={form.publishedDate} onChange={(e) => set('publishedDate', e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="language">Language</Label>
            <Input id="language" value={form.language} onChange={(e) => set('language', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="isbn">ISBN</Label>
            <Input id="isbn" value={form.isbn} onChange={(e) => set('isbn', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asin">ASIN</Label>
            <Input id="asin" value={form.asin} onChange={(e) => set('asin', e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={5}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.explicit} onCheckedChange={(checked) => set('explicit', checked === true)} />
            Explicit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.abridged} onCheckedChange={(checked) => set('abridged', checked === true)} />
            Abridged
          </label>
        </div>

        <div className="flex items-center gap-3 border-t pt-5">
          <Button onClick={() => void onSave()} disabled={updateMetadata.isPending} className="gap-1.5">
            {updateMetadata.isPending && <Spinner variant="ring" size={14} />}
            Save
          </Button>
          <Button asChild variant="ghost">
            <Link to={`/item/${itemId}`}>Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
