import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSocket } from '@/lib/socket'

export interface ScanResult {
  added: number
  updated: number
  missing: number
  elapsed: number
  text: string
}

interface TaskPayload {
  action: string
  isFinished?: boolean
  data?: { libraryId?: string; scanResults?: ScanResult }
}

/**
 * Live library-scan status via Socket.IO.
 *
 * The server only brackets a scan with `task_started` / `task_finished` — see
 * server/scanner/LibraryScanner.js — there is no per-item progress event, so
 * "live progress" here honestly means "scanning..." until it's done, then the
 * real counts from the finished task. Anything claiming a percentage or a
 * running item count would be fabricating a signal the server doesn't send.
 */
export function useLibraryScanStatus(libraryId: string | undefined) {
  const [isScanning, setIsScanning] = useState(false)
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!libraryId) return
    const socket = getSocket()

    function isThisLibraryScan(task: TaskPayload) {
      return task.action === 'library-scan' && task.data?.libraryId === libraryId
    }

    function onStarted(task: TaskPayload) {
      if (isThisLibraryScan(task)) setIsScanning(true)
    }

    function onFinished(task: TaskPayload) {
      if (!isThisLibraryScan(task)) return
      setIsScanning(false)
      if (task.data?.scanResults) setLastResult(task.data.scanResults)

      // A scan can add, update, or remove items — refresh everything derived
      // from the library's contents rather than guessing which changed.
      void queryClient.invalidateQueries({ queryKey: ['library-items'] })
      void queryClient.invalidateQueries({ queryKey: ['library-stats', libraryId] })
      void queryClient.invalidateQueries({ queryKey: ['library-filterdata', libraryId] })
      void queryClient.invalidateQueries({ queryKey: ['library-series', libraryId] })
      void queryClient.invalidateQueries({ queryKey: ['libraries'] })
    }

    socket.on('task_started', onStarted)
    socket.on('task_finished', onFinished)
    return () => {
      socket.off('task_started', onStarted)
      socket.off('task_finished', onFinished)
    }
  }, [libraryId, queryClient])

  return { isScanning, lastResult }
}
