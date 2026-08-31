import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * `PATCH /me/password` (`server/controllers/MeController.js`). On success the
 * server rotates this session's refresh cookie and revokes every other one,
 * but only returns the new access token in the response body if we send an
 * `x-refresh-token` header — which we don't, since the refresh cookie already
 * does that job. The in-memory access token is left stale for the rest of
 * this session; `api.ts`'s existing 401-refresh-and-retry already mints a
 * fresh one transparently on the next call, so there is nothing extra to do
 * here.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({ password, newPassword }: { password: string; newPassword: string }) => api.patch<void>('/me/password', { password, newPassword })
  })
}
