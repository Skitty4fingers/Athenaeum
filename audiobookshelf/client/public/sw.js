// Service worker for offline playback AND the PWA app shell. Vite copies
// public/ verbatim to dist/ — this file is NOT bundled/transformed, so it
// can't import from src/. The token-stripping cache-key logic below is
// intentionally duplicated from src/lib/offline.ts's `cacheKeyFor` for that
// reason; keep them in sync if either changes.
//
// Three independent jobs, each scoped to its own request pattern:
//  1. Audio files (/api/items/:id/file/:fileId) — served from cache when
//     downloaded, including real Range support for seeking. Caching here is
//     opt-in, populated only by offline.ts's downloadItem(), never
//     implicitly by this fetch handler.
//  2. Navigations (a real page load/reload) — network-first, falling back to
//     a cached app shell when offline, so the app can cold-load with no
//     connectivity at all once it's been visited online at least once.
//  3. Static assets (hashed JS/CSS under /assets/, favicon, manifest) —
//     cache-first, since a hashed filename is immutable per build.

const AUDIO_CACHE_NAME = 'athenaeum-offline-audio-v1'
const SHELL_CACHE_NAME = 'athenaeum-shell-v1'
const AUDIO_FILE_PATTERN = /\/api\/items\/[^/]+\/file\/[^/?]+/

// Derived from this script's own URL rather than hardcoded, so it tracks
// whatever ROUTER_BASE_PATH the deployment actually uses.
const BASE = self.location.pathname.replace(/sw\.js$/, '')

self.addEventListener('install', (event) => {
  self.skipWaiting()
  // Best-effort: warm the shell cache immediately so even a device that's
  // never opened the app past this install could still get something.
  // Not fatal if it fails — the first real online visit populates it too.
  event.waitUntil(
    caches
      .open(SHELL_CACHE_NAME)
      .then((cache) => cache.add(BASE))
      .catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function cacheKeyFor(url) {
  const u = new URL(url)
  u.searchParams.delete('token')
  return u.toString()
}

function isStaticAsset(pathname) {
  return pathname.startsWith(`${BASE}assets/`) || pathname === `${BASE}favicon.svg` || pathname === `${BASE}manifest.json`
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (AUDIO_FILE_PATTERN.test(url.pathname)) {
    event.respondWith(handleAudioRequest(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(request))
  }
})

/** Network-first: an online load always gets the current build. Offline falls back to whatever shell was last cached. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(SHELL_CACHE_NAME)
    cache.put(BASE, response.clone())
    return response
  } catch {
    const cache = await caches.open(SHELL_CACHE_NAME)
    const cached = await cache.match(BASE)
    if (cached) return cached
    throw new Error('Offline, and no cached app shell yet — needs one real visit online first.')
  }
}

/** Cache-first: a hashed asset filename never changes meaning, so a hit is always correct — no need to revalidate. */
async function handleStaticAsset(request) {
  const cache = await caches.open(SHELL_CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function handleAudioRequest(request) {
  const cache = await caches.open(AUDIO_CACHE_NAME)
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
