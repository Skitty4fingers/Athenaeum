import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface EditableSeries {
  name: string
  sequence: string
}

interface SeriesEditorProps {
  values: EditableSeries[]
  onChange: (values: EditableSeries[]) => void
}

/**
 * Series need a name *and* an optional sequence number, so they don't fit
 * StringListEditor's plain chip model — each entry is its own row.
 */
export function SeriesEditor({ values, onChange }: SeriesEditorProps) {
  function update(index: number, patch: Partial<EditableSeries>) {
    onChange(values.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...values, { name: '', sequence: '' }])
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Series</label>
      <div className="space-y-2">
        {values.map((series, index) => (
          <div key={index} className="flex gap-2">
            <Input value={series.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="Series name" className="flex-1" />
            <Input value={series.sequence} onChange={(e) => update(index, { sequence: e.target.value })} placeholder="#" className="w-16" />
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove series" className="shrink-0 text-muted-foreground hover:text-destructive">
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="size-3.5" />
        Add series
      </Button>
    </div>
  )
}
