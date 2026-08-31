import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { LogEntry } from '@/types/abs'

/** `GET /api/logger-data`. Admin-gated, up to the last 5000 lines of today's log. */
export function useLoggerData() {
  return useQuery({
    queryKey: ['logger-data'],
    queryFn: () => api.get<{ currentDailyLogs: LogEntry[] | '' }>('/logger-data'),
    select: (data) => (Array.isArray(data.currentDailyLogs) ? data.currentDailyLogs : [])
  })
}
