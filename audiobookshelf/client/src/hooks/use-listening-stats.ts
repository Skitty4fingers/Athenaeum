import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ListeningStats } from '@/types/abs'

export function useListeningStats() {
  return useQuery({
    queryKey: ['listening-stats'],
    queryFn: () => api.get<ListeningStats>('/me/listening-stats'),
    staleTime: 60_000
  })
}
