import { useEffect, useState } from 'react'
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
 *
 * This hook owns the *UI state* of a scan only. Refreshing the caches a
 * finished scan invalidates is `lib/socket-sync.ts`'s job, which subscribes to
 * `task_finished` app-wide — so a scan started here still refreshes the
 * library for a user sitting on any other page.
 */
export function useLibraryScanStatus(libraryId: string | undefined) {
  const [isScanning, setIsScanning] = useState(false)
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)

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
    }

    socket.on('task_started', onStarted)
    socket.on('task_finished', onFinished)
    return () => {
      socket.off('task_started', onStarted)
      socket.off('task_finished', onFinished)
    }
  }, [libraryId])

  return { isScanning, lastResult }
}
