import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { LogOut, Menu, Search, User as UserIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ThemeSwitcher } from '@/components/kibo-ui/theme-switcher'
import { SidebarContent } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { PlayerBar } from '@/features/player/PlayerBar'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'

/** Opens the global palette by synthesising the same shortcut it listens for. */
function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
}

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { theme, setTheme } = useTheme()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const playerActive = usePlayerStore((s) => Boolean(s.session))

  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-svh bg-background">
      <CommandPalette />

      {/* Persistent rail on desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <Button variant="outline" onClick={openCommandPalette} className="h-9 max-w-64 flex-1 justify-start gap-2 px-3 text-muted-foreground font-normal sm:flex-none sm:w-64">
            <Search className="size-4" />
            <span className="truncate">Search…</span>
            <kbd className="ml-auto hidden select-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">⌘K</kbd>
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitcher value={theme as 'light' | 'dark' | 'system'} onChange={setTheme} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate font-medium">{user?.username}</span>
                  <span className="text-xs font-normal capitalize text-muted-foreground">{user?.type}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <UserIcon className="size-4" /> Account settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Bottom padding keeps the last row of content clear of the player bar. */}
        <main className={playerActive ? 'pb-28' : undefined}>
          <Outlet />
        </main>
      </div>

      <PlayerBar />
    </div>
  )
}
