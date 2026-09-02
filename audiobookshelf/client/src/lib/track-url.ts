import { getAccessToken } from '@/lib/api'
import { apiPath } from '@/lib/config'

/** Minimal shape both the live player and the offline downloader need. */
export interface UrlAudioTrack {
  contentUrl: string
}

/**
 * Track URLs are authenticated, and an <audio> element cannot send headers.
 * The server accepts the access token as a query parameter for exactly this
 * reason (`ExtractJwt.fromUrlQueryParameter('token')` in Auth.js).
 *
 * Split out from `stores/player.ts` so `lib/offline.ts` can build the exact
 * same URL a downloaded track will later be requested at — offline.ts caches
 * under this URL's normalized key, and the live player and the service
 * worker both need to agree on it without importing each other.
 */
export function trackUrl(track: UrlAudioTrack): string {
  const token = getAccessToken()
  const path = track.contentUrl.replace(/^\/api/, apiPath)
  return token ? `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : path
}
