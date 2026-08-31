import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getAccessToken } from '@/lib/api'
import { apiPath } from '@/lib/config'
import type { Backup } from '@/types/abs'

/**
 * `server/controllers/BackupController.js`, admin-gated (`isAdminOrUp`).
 * Deliberately doesn't cover every endpoint that exists — restoring from a
 * backup (`GET /backups/:id/apply`) replaces the live database wholesale,
 * and offering that as a one-click UI action is a different, much higher-
 * stakes feature than "let me grab a backup without ssh-ing in." Left for a
 * direct API call if it's ever actually needed.
 */
export function useBackups() {
  return useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<{ backups: Backup[]; backupLocation: string; backupPathEnvSet: boolean }>('/backups')
  })
}

export function useCreateBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/backups'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['backups'] })
  })
}

export function useDeleteBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (backupId: string) => api.delete(`/backups/${backupId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['backups'] })
  })
}

/**
 * The download route needs the same bearer auth as everything else under
 * `/api`, and a plain `<a href>` can't send an Authorization header — so,
 * same mechanism as authenticated audio track URLs, the token rides in the
 * query string (the server's JWT strategy accepts either).
 */
export function backupDownloadUrl(backupId: string): string {
  const token = getAccessToken()
  const qs = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${apiPath}/backups/${backupId}/download${qs}`
}
