import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, BarChart3, DatabaseBackup, HelpCircle, LogOut, Menu, Search, Settings, User as UserIcon, Users } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ThemeSwitcher } from '@/components/kibo-ui/theme-switcher'
import { SidebarContent } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { Spinner } from '@/components/kibo-ui/spinner'
import { PlayerBar } from '@/features/player/PlayerBar'
import { ResumePrompt } from '@/features/player/ResumePrompt'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { installSocketSync } from '@/lib/socket-sync'

/** Opens the global palette by synthesising the same shortcut it listens for. */
function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
}

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  // Live sync for the whole authenticated session. AppShell is the layout for
  // every signed-in route, so this mounts once and survives navigation —
  // subscribing per-page would drop events whenever the user moved.
  useEffect(() => installSocketSync(queryClient), [queryClient])

  const { theme, setTheme } = useTheme()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // NowPlayingPage is a full-screen route, not a Radix dialog, so nothing
  // traps focus inside it by default — the sidebar and header stay mounted
  // underneath (AppShell is the layout, not per-route) and stay reachable by
  // Tab despite being visually covered. `inert` removes them from the a11y
  // tree and tab order entirely while that route is active.
  const location = useLocation()
  const isNowPlaying = location.pathname.endsWith('/now-playing')
  const playerActive = usePlayerStore((s) => Boolean(s.session))
  // The resume prompt occupies the same bottom bar once the player itself
  // isn't — the two are mutually exclusive, so this doesn't double up.
  const resumePending = usePlayerStore((s) => !s.session && Boolean(s.resumeItemId))

  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase()
  const isAdmin = user?.type === 'root' || user?.type === 'admin'

  return (
    <div className="min-h-svh bg-background">
      <CommandPalette />

      {/* Persistent rail on desktop */}
      <aside inert={isNowPlaying} className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      <div className="lg:pl-60">
        <header inert={isNowPlaying} className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
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
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings className="size-4" /> Library settings
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/users">
                      <Users className="size-4" /> User management
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/activity">
                      <Activity className="size-4" /> Activity
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/system">
                      <DatabaseBackup className="size-4" /> System settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/account">
                    <UserIcon className="size-4" /> Account settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/stats">
                    <BarChart3 className="size-4" /> Listening stats
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/help">
                    <HelpCircle className="size-4" /> Help &amp; mobile apps
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Bottom padding keeps the last row of content clear of the player bar or resume prompt. */}
        <main className={playerActive ? 'pb-28' : resumePending ? 'pb-16' : undefined}>
          <Suspense fallback={<div className="flex justify-center py-24"><Spinner variant="ring" size={28} className="text-muted-foreground" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* The mini player sits behind NowPlayingPage's full-screen overlay (z-40
          vs z-50) but stays mounted underneath — same `inert` treatment as the
          sidebar/header, or its controls would still be reachable by Tab. */}
      <div inert={isNowPlaying}>
        <PlayerBar />
        <ResumePrompt />
      </div>
    </div>
  )
}
