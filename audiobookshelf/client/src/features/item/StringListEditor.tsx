import { useState } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface StringListEditorProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  className?: string
}

/**
 * A plain "type text, press Enter or comma to add a chip" list editor —
 * genres, tags and narrators are just arrays of strings server-side (see
 * server/models/Book.js#updateFromRequest), so this is deliberately simpler
 * than Kibo's Tags combobox, which is built for picking from a known set
 * rather than freely adding new values.
 */
export function StringListEditor({ label, values, onChange, placeholder, className }: StringListEditorProps) {
  const [draft, setDraft] = useState('')

  function commitDraft() {
    const trimmed = draft.trim()
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed])
    setDraft('')
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && !draft && values.length > 0) {
      // Backspace on an empty field deletes the last chip — the usual chip-input affordance.
      onChange(values.slice(0, -1))
    }
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index))
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium">{label}</label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-ring/50">
        {values.map((value, index) => (
          <Badge key={`${value}-${index}`} variant="secondary" className="gap-1 pr-1">
            {value}
            <button type="button" onClick={() => remove(index)} aria-label={`Remove ${value}`} className="rounded-full p-0.5 hover:bg-muted-foreground/20">
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitDraft}
          placeholder={values.length === 0 ? placeholder : undefined}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}
