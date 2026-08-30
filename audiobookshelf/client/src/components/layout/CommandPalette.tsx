import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Headphones, Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { useLibraries } from '@/hooks/use-library'

/**
 * Global ⌘K / Ctrl+K palette. Currently jumps between libraries and switches
 * theme; item-level search will hang off the same surface.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { data: libraries } = useLibraries()

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

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump to a library or change appearance">
      <CommandInput placeholder="Jump to a library, change the theme…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {!!libraries?.length && (
          <CommandGroup heading="Libraries">
            {libraries.map((library) => {
              const Icon = library.mediaType === 'podcast' ? Headphones : BookOpen
              return (
                <CommandItem key={library.id} value={`library ${library.name}`} onSelect={() => run(() => navigate(`/library/${library.id}`))}>
                  <Icon className="size-4" />
                  {library.name}
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Appearance">
          <CommandItem value="theme dark" onSelect={() => run(() => setTheme('dark'))}>
            <Moon className="size-4" /> Dark theme
          </CommandItem>
          <CommandItem value="theme light" onSelect={() => run(() => setTheme('light'))}>
            <Sun className="size-4" /> Light theme
          </CommandItem>
          <CommandItem value="theme system" onSelect={() => run(() => setTheme('system'))}>
            <Monitor className="size-4" /> System theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
