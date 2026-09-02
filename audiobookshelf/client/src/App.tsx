import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useAppName, useAuthStore } from '@/stores/auth'
import { AppShell } from '@/components/layout/AppShell'
import { Spinner } from '@/components/kibo-ui/spinner'
import { NotFoundPage } from '@/features/not-found/NotFoundPage'

// Route-level code splitting: each feature area ships in its own chunk instead
// of one bundle growing with every page added. AppShell wraps <Outlet /> in
// its own Suspense boundary, so switching between these only re-suspends the
// content area — the sidebar, header and player bar stay mounted.
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const LibraryPage = lazy(() => import('@/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const ItemPage = lazy(() => import('@/features/item/ItemPage').then((m) => ({ default: m.ItemPage })))
const SeriesPage = lazy(() => import('@/features/series/SeriesPage').then((m) => ({ default: m.SeriesPage })))
const LibrarySettingsPage = lazy(() => import('@/features/settings/LibrarySettingsPage').then((m) => ({ default: m.LibrarySettingsPage })))
const UsersPage = lazy(() => import('@/features/settings/UsersPage').then((m) => ({ default: m.UsersPage })))
const ActivityPage = lazy(() => import('@/features/settings/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const AccountSettingsPage = lazy(() => import('@/features/settings/AccountSettingsPage').then((m) => ({ default: m.AccountSettingsPage })))
const AuthorPage = lazy(() => import('@/features/author/AuthorPage').then((m) => ({ default: m.AuthorPage })))
const CollectionsPage = lazy(() => import('@/features/collections/CollectionsPage').then((m) => ({ default: m.CollectionsPage })))
const CollectionPage = lazy(() => import('@/features/collections/CollectionPage').then((m) => ({ default: m.CollectionPage })))
const PlaylistsPage = lazy(() => import('@/features/playlists/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })))
const PlaylistPage = lazy(() => import('@/features/playlists/PlaylistPage').then((m) => ({ default: m.PlaylistPage })))
const ListeningStatsPage = lazy(() => import('@/features/stats/ListeningStatsPage').then((m) => ({ default: m.ListeningStatsPage })))
const SystemPage = lazy(() => import('@/features/settings/SystemPage').then((m) => ({ default: m.SystemPage })))
const HelpPage = lazy(() => import('@/features/help/HelpPage').then((m) => ({ default: m.HelpPage })))
const NowPlayingPage = lazy(() => import('@/features/player/NowPlayingPage').then((m) => ({ default: m.NowPlayingPage })))
const ItemEditPage = lazy(() => import('@/features/item/ItemEditPage').then((m) => ({ default: m.ItemEditPage })))
const ChapterEditorPage = lazy(() => import('@/features/item/ChapterEditorPage').then((m) => ({ default: m.ChapterEditorPage })))

function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <Spinner className="text-muted-foreground" variant="ring" size={32} />
    </div>
  )
}

/** Gates the authenticated area, preserving the attempted URL across sign-in. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'idle' || status === 'restoring') return <FullPageSpinner />
  if (status !== 'authenticated') {
    return <Navigate to="/signin" state={{ from: location }} replace />
  }
  return <>{children}</>
}

/** Sends an already-signed-in user straight past the login screen. */
function LibraryRedirect() {
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  return <Navigate to={defaultLibraryId ? `/library/${defaultLibraryId}` : '/library'} replace />
}

export default function App() {
  const status = useAuthStore((s) => s.status)
  const restore = useAuthStore((s) => s.restore)
  const appName = useAppName()

  useEffect(() => {
    if (status === 'idle') void restore()
  }, [status, restore])

  // index.html's <title> only covers the build-time default; once an admin
  // override loads (post sign-in), the tab title should reflect it too.
  useEffect(() => {
    document.title = appName
  }, [appName])

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/signin" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<LibraryRedirect />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/:libraryId" element={<LibraryPage />} />
          <Route path="/item/:itemId" element={<ItemPage />} />
          <Route path="/item/:itemId/edit" element={<ItemEditPage />} />
          <Route path="/item/:itemId/chapters" element={<ChapterEditorPage />} />
          <Route path="/series/:seriesId" element={<SeriesPage />} />
          <Route path="/author/:authorId" element={<AuthorPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:collectionId" element={<CollectionPage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlists/:playlistId" element={<PlaylistPage />} />
          <Route path="/stats" element={<ListeningStatsPage />} />
          <Route path="/system" element={<SystemPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<LibrarySettingsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/account" element={<AccountSettingsPage />} />
          <Route path="/now-playing" element={<NowPlayingPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
