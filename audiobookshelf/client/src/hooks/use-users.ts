import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { User } from '@/types/abs'

/**
 * User management (`server/controllers/UserController.js`).
 * Deliberately minimal — list, add, remove, reset password — no permissions
 * editor. A few server-side rules worth knowing since the UI has to respect
 * them (return codes, not just good manners):
 *
 * - The root user (the initial account) can't be deleted or have its type
 *   changed, by anyone including other admins.
 * - You can't delete your own account.
 * - A user's list of accessible libraries doesn't matter here — VoxSilo is
 *   single-library, so every user implicitly has access to the one library.
 */

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: User[] }>('/users'),
    select: (data) => data.users,
    staleTime: 30_000
  })
}

export interface CreateUserInput {
  username: string
  password: string
  type: 'admin' | 'user' | 'guest'
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    // The server defaults isActive to false unless told otherwise — a
    // person added here should be able to sign in immediately.
    mutationFn: (input: CreateUserInput) => api.post('/users', { ...input, isActive: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] })
  })
}

export function useResetPassword(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (password: string) => api.patch(`/users/${userId}`, { password }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] })
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/users/${userId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] })
  })
}
