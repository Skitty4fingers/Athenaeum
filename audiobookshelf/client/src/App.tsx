import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useAuthStore } from '@/stores/auth'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { ItemPage } from '@/features/item/ItemPage'
import { SeriesPage } from '@/features/series/SeriesPage'
import { Spinner } from '@/components/kibo-ui/spinner'

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
    return <Navigate to="/login" state={{ from: location }} replace />
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

  useEffect(() => {
    if (status === 'idle') void restore()
  }, [status, restore])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="/series/:seriesId" element={<SeriesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
