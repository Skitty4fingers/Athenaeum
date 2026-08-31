import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface CollapsibleFilterSectionProps {
  label: string
  icon: React.ElementType
  count?: number
  children: React.ReactNode
  /** All these sections start closed — the sidebar shouldn't open with four long lists expanded. */
  defaultOpen?: boolean
}

/**
 * A sidebar filter group (Genres, Series, Authors, Narrators) that starts
 * collapsed. These lists can run to dozens of entries on a real library, so
 * showing all four open by default buries the nav items above them.
 */
export function CollapsibleFilterSection({ label, icon: Icon, count, children, defaultOpen = false }: CollapsibleFilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 transition-colors hover:text-foreground">
        <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
        <Icon className="size-3.5 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && <span className="tabular-nums">{count}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5">{children}</CollapsibleContent>
    </Collapsible>
  )
}
