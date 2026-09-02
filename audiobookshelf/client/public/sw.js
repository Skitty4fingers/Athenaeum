// Service worker for offline playback. Vite copies public/ verbatim to
// dist/ — this file is NOT bundled/transformed, so it can't import from
// src/. The token-stripping cache-key logic below is intentionally
// duplicated from src/lib/offline.ts's `cacheKeyFor` for that reason; keep
// them in sync if either changes.
//
// Only intercepts requests to an item's audio file
// (/api/items/:id/file/:fileId, wherever the app's base path puts it).
// Everything else passes straight through to the network, untouched.
// Caching itself is opt-in — populated by offline.ts's downloadItem(),
// never implicitly by this fetch handler; a cache miss here just falls
// through to a normal network fetch.

const CACHE_NAME = 'athenaeum-offline-audio-v1'
const AUDIO_FILE_PATTERN = /\/api\/items\/[^/]+\/file\/[^/?]+/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function cacheKeyFor(url) {
  const u = new URL(url)
  u.searchParams.delete('token')
  return u.toString()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !AUDIO_FILE_PATTERN.test(new URL(request.url).pathname)) return

  event.respondWith(handleAudioRequest(request))
})

async function handleAudioRequest(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(cacheKeyFor(request.url))

  if (!cached) return fetch(request)

  const range = request.headers.get('range')
  return range ? sliceForRange(cached, range) : cached.clone()
}

/** Builds a 206 Partial Content response from a fully-cached 200 one — audio scrubbing depends on Range support. */
async function sliceForRange(cachedResponse, rangeHeader) {
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
  if (!match) return cachedResponse.clone()

  const blob = await cachedResponse.clone().blob()
  const total = blob.size
  const start = match[1] ? parseInt(match[1], 10) : 0
  const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1
  const chunk = blob.slice(start, end + 1)

  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(chunk.size),
      'Accept-Ranges': 'bytes'
    }
  })
}
