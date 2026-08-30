import { useEffect, useMemo, useState } from 'react'
import { Check, Sparkles, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/kibo-ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BUILTIN_PROVIDERS, useApplyMetadata, useMetadataMatches, useMetadataProviders, type MetadataMatch } from '@/hooks/use-enrichment'
import type { BookMetadataMinified } from '@/types/abs'

/**
 * Fields a provider may contribute.
 *
 * `payloadKey` exists because the provider contract and audiobookshelf's update
 * payload disagree in places: a provider returns `narrator` as one string but
 * the media model stores `narrators` as an array, and provider series entries
 * are `{series, sequence}` while the update expects `{name, sequence}`.
 */
const FIELDS = [
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'narrator', label: 'Narrator', payloadKey: 'narrators' },
  { key: 'series', label: 'Series' },
  { key: 'description', label: 'Description' },
  { key: 'publishedYear', label: 'Published year' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'asin', label: 'ASIN' },
  { key: 'language', label: 'Language' },
  { key: 'genres', label: 'Genres' }
] as const

type FieldKey = (typeof FIELDS)[number]['key']

/** Current value on the item, for fields whose names differ from the match. */
function currentValueFor(key: FieldKey, metadata: BookMetadataMinified): unknown {
  if (key === 'narrator') return metadata.narratorName
  if (key === 'series') return metadata.seriesName
  return metadata[key as keyof BookMetadataMinified]
}

/**
 * Built-in providers (Audible especially) return descriptions as HTML.
 * VoxSilo renders descriptions as plain text, and the Libation converter also
 * stores plain text, so normalise here rather than letting markup reach the
 * database and show up as literal tags.
 */
function htmlToText(html: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Shapes a match value into what PATCH /items/:id/media expects. */
function payloadValueFor(key: FieldKey, value: unknown): unknown {
  if (key === 'description' && typeof value === 'string') return htmlToText(value)
  if (key === 'narrator') {
    return String(value)
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
  }
  if (key === 'series' && Array.isArray(value)) {
    return (value as { series: string; sequence?: string }[]).map((entry) => ({ name: entry.series, sequence: entry.sequence ?? null }))
  }
  return value
}

interface Proposal {
  key: FieldKey
  label: string
  payloadKey: string
  current: string | null
  next: string
  value: unknown
  /** True when the item has nothing here, so accepting is purely additive. */
  isAddition: boolean
}

function displayValue(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    if (!value.length) return null
    return value
      .map((entry) => {
        // Series are objects, and appear in two shapes: `{series}` as the
        // provider returns them, and `{name}` after mapping to the update
        // payload. Render either the way the item page does.
        if (entry && typeof entry === 'object') {
          const s = entry as { series?: string; name?: string; sequence?: string | null }
          const label = s.series ?? s.name
          if (label) return s.sequence ? `${label} #${s.sequence}` : label
        }
        return String(entry)
      })
      .join(', ')
  }
  const text = String(value).trim()
  return text || null
}

/**
 * Builds the reviewable change set. Additions are pre-selected; replacements
 * are not — Libation's tags are usually better than Open Library's for things
 * like narrator and publisher, so overwriting is always an explicit choice.
 */
function buildProposals(current: BookMetadataMinified, match: MetadataMatch): Proposal[] {
  const proposals: Proposal[] = []

  for (const field of FIELDS) {
    const nextRaw = match[field.key as keyof MetadataMatch]
    // Preview exactly what will be written, markup already stripped.
    const nextValue = payloadValueFor(field.key, nextRaw)
    const next = displayValue(field.key === 'narrator' ? nextRaw : nextValue)
    if (!next) continue

    const currentText = displayValue(currentValueFor(field.key, current))
    if (currentText === next) continue

    proposals.push({
      key: field.key,
      label: field.label,
      payloadKey: 'payloadKey' in field ? field.payloadKey : field.key,
      current: currentText,
      next,
      value: nextValue,
      isAddition: !currentText
    })
  }

  return proposals
}

interface EnrichDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
  metadata: BookMetadataMinified
}

export function EnrichDialog({ open, onOpenChange, itemId, metadata }: EnrichDialogProps) {
  const { data: customProviders } = useMetadataProviders()

  /** Built-ins plus anything registered, addressed by provider slug. */
  const providerOptions = useMemo(
    () => [...BUILTIN_PROVIDERS.map((p) => ({ slug: p.slug as string, name: p.name as string })), ...(customProviders ?? []).map((p) => ({ slug: `custom-${p.id}`, name: p.name }))],
    [customProviders]
  )

  // Audible is the default: it is the only source that knows narrators and
  // audiobook series numbering, which is where scanned tags are weakest.
  const [providerSlug, setProviderSlug] = useState('audible')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [accepted, setAccepted] = useState<Set<FieldKey>>(new Set())

  const {
    data: matches,
    isPending: matchesPending,
    isFetching,
    isError
  } = useMetadataMatches({
    itemId,
    provider: providerSlug,
    title: metadata.title ?? undefined,
    author: metadata.authorName,
    enabled: open
  })

  const apply = useApplyMetadata(itemId)
  const match = matches?.[selectedIndex]
  const proposals = useMemo(() => (match ? buildProposals(metadata, match) : []), [metadata, match])

  // Re-seed the selection whenever the candidate changes: additions on,
  // replacements off.
  useEffect(() => {
    setAccepted(new Set(proposals.filter((p) => p.isAddition).map((p) => p.key)))
  }, [proposals])

  useEffect(() => {
    if (open) setSelectedIndex(0)
  }, [open])

  function toggle(key: FieldKey) {
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function onApply() {
    const payload: Record<string, unknown> = {}
    for (const proposal of proposals) {
      if (accepted.has(proposal.key)) payload[proposal.payloadKey] = proposal.value
    }
    if (!Object.keys(payload).length) return

    try {
      await apply.mutateAsync(payload)
      toast.success(`Updated ${Object.keys(payload).length} field${Object.keys(payload).length === 1 ? '' : 's'}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not apply metadata')
    }
  }

  const acceptedCount = proposals.filter((p) => accepted.has(p.key)).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Enrich metadata
          </DialogTitle>
          <DialogDescription>Look up "{metadata.title}" and choose what to apply.</DialogDescription>

          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-muted-foreground">Source</span>
            <Select value={providerSlug} onValueChange={setProviderSlug}>
              <SelectTrigger className="h-8 w-56" aria-label="Metadata provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.slug} value={option.slug}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="max-h-[55svh] overflow-y-auto px-6 py-4 scrollbar-slim">
          {(matchesPending || isFetching) && (
            <div className="flex items-center gap-2.5 py-8 text-sm text-muted-foreground">
              <Spinner variant="ring" size={18} />
              Looking up candidates…
            </div>
          )}

          {isError && <p className="py-6 text-sm text-muted-foreground">This provider could not be reached. If it is a custom provider, check the service is running.</p>}

          {matches && !isFetching && matches.length === 0 && <p className="py-6 text-sm text-muted-foreground">No candidates found for this title.</p>}

          {matches && !isFetching && matches.length > 0 && (
            <>
              {matches.length > 1 && (
                <div className="mb-4 space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Candidate</p>
                  {matches.map((candidate, index) => (
                    <button
                      key={`${candidate.title}-${index}`}
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      className={cn('flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors', index === selectedIndex ? 'border-primary bg-primary/5' : 'hover:bg-accent/50')}
                    >
                      <div className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', index === selectedIndex && 'border-primary bg-primary text-primary-foreground')}>{index === selectedIndex && <Check className="size-2.5" />}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{candidate.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[candidate.author, candidate.publishedYear, candidate.isbn].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {proposals.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">This candidate adds nothing new — your metadata already matches.</p>
              ) : (
                <div className="space-y-1">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Proposed changes</p>
                  {proposals.map((proposal) => (
                    <label key={proposal.key} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/40">
                      <Checkbox checked={accepted.has(proposal.key)} onCheckedChange={() => toggle(proposal.key)} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{proposal.label}</span>
                          {proposal.isAddition ? (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">Add</span>
                          ) : (
                            <span className="flex items-center gap-1 rounded bg-playing/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-playing">
                              <TriangleAlert className="size-2.5" />
                              Replace
                            </span>
                          )}
                        </div>
                        {proposal.current && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground line-through">{proposal.current}</p>}
                        <p className="mt-0.5 line-clamp-3 text-xs text-foreground/80">{proposal.next}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onApply} disabled={acceptedCount === 0 || apply.isPending}>
            {apply.isPending && <Spinner variant="ring" size={14} />}
            Apply {acceptedCount > 0 && `${acceptedCount} change${acceptedCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
