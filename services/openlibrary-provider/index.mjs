#!/usr/bin/env node
/**
 * Open Library metadata provider for audiobookshelf.
 *
 * Implements the custom metadata provider contract documented in
 * `audiobookshelf/custom-metadata-provider-specification.yaml`:
 *
 *   GET /search?mediaType=book&query=<title>&author=<author>&isbn=<isbn>
 *   Authorization: <api key>
 *   -> { matches: [BookMetadata] }
 *
 * Why this is worth having alongside the Libation sidecars: Audible's metadata
 * describes the *audiobook* — its `issue_date` is when the recording shipped,
 * not when the novel was published, and it carries no ISBN. Open Library is
 * work-centric, so it supplies `first_publish_year`, ISBNs, subject headings
 * and print covers that Audible does not.
 *
 * Runs on plain Node with no dependencies.
 *
 * Env:
 *   PORT                  default 3444
 *   PROVIDER_API_KEY      if set, requests must send it in the Authorization header
 *   OL_BASE               default https://openlibrary.org
 */

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 3444)
const API_KEY = process.env.PROVIDER_API_KEY ?? null
const OL_BASE = process.env.OL_BASE ?? 'https://openlibrary.org'

// Open Library asks that automated clients identify themselves so they can
// contact you rather than silently rate-limit. https://openlibrary.org/developers/api
const USER_AGENT = 'VoxSilo-MetadataProvider/0.1 (+https://github.com/advplyr/audiobookshelf; self-hosted)'

/** Fields worth pulling from the search index; keeps responses small and fast. */
const SEARCH_FIELDS = ['key', 'title', 'subtitle', 'author_name', 'first_publish_year', 'isbn', 'cover_i', 'publisher', 'language', 'subject', 'number_of_pages_median', 'edition_count'].join(',')

const MAX_MATCHES = 5
/** Only the strongest candidates get a second request for their description. */
const MAX_DESCRIPTION_FETCHES = 3

const LANGUAGES = {
  eng: 'English',
  spa: 'Spanish',
  fre: 'French',
  fra: 'French',
  ger: 'German',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  dut: 'Dutch',
  nld: 'Dutch',
  rus: 'Russian',
  jpn: 'Japanese',
  chi: 'Chinese',
  kor: 'Korean',
  swe: 'Swedish',
  nor: 'Norwegian',
  dan: 'Danish',
  fin: 'Finnish',
  pol: 'Polish'
}

// ---------------------------------------------------------------- cache ----

const CACHE_TTL_MS = 60 * 60 * 1000
const cache = new Map()

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.value
}

function cacheSet(key, value) {
  // Bounded so a long-running instance cannot grow without limit.
  if (cache.size > 500) cache.clear()
  cache.set(key, { at: Date.now(), value })
}

// ----------------------------------------------------------- OL helpers ----

async function olFetch(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function titleCase(value) {
  return value
    .split(' ')
    .map((word) => (word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

/**
 * Open Library mixes machine-readable prefixes ("genre:high fantasy",
 * "series:The Mistborn Saga", "form:novel") into the same `subject` array as
 * free-text headings. Split them so each lands somewhere sensible.
 */
function partitionSubjects(subjects = []) {
  const genres = new Set()
  const series = []
  const tags = new Set()

  for (const raw of subjects) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const subject = raw.trim()
    const separator = subject.indexOf(':')
    const prefix = separator > 0 ? subject.slice(0, separator).toLowerCase() : null
    const value = separator > 0 ? subject.slice(separator + 1).trim() : subject

    if (prefix === 'genre') {
      genres.add(titleCase(value))
    } else if (prefix === 'series') {
      // Occasionally encoded as "Name #3" or "Name, #3".
      const match = value.match(/^(.*?)[,\s]*#\s*([\w.]+)$/)
      if (match) series.push({ series: match[1].trim(), sequence: match[2] })
      else series.push({ series: value })
    } else if (prefix === 'form' || prefix === 'place' || prefix === 'time' || prefix === 'person') {
      tags.add(titleCase(value))
    } else {
      tags.add(subject)
    }
  }

  return {
    genres: [...genres],
    series,
    tags: [...tags].slice(0, 12)
  }
}

/**
 * The search index lists ISBNs for every edition in every language, in no
 * useful order, so `[0]` routinely lands on a foreign translation. ISBN
 * registration groups 0 and 1 (i.e. 978-0…, 978-1…) are the English-language
 * groups, so prefer those before falling back.
 */
function pickIsbn(isbns = []) {
  if (!Array.isArray(isbns) || !isbns.length) return undefined
  const normalised = isbns.filter((i) => typeof i === 'string').map((i) => i.replace(/-/g, ''))
  const isbn13 = normalised.filter((i) => i.length === 13)

  const english13 = isbn13.find((i) => i.startsWith('9780') || i.startsWith('9781'))
  if (english13) return english13

  // ISBN-10s in the English groups start with 0 or 1.
  const english10 = normalised.find((i) => i.length === 10 && /^[01]/.test(i))
  if (english10) return english10

  return isbn13[0] ?? normalised[0]
}

function extractDescription(work) {
  if (!work) return undefined
  const description = work.description
  const text = typeof description === 'string' ? description : description?.value
  if (typeof text !== 'string' || !text.trim()) return undefined
  // Open Library descriptions often end with a source/attribution footer after
  // a horizontal rule; drop it, it is not part of the blurb.
  return text.split(/\n-{3,}\n/)[0].trim()
}

/**
 * The search index flattens every edition of a work into one document, so
 * `publisher` and `language` are unordered lists spanning all translations.
 * Taking `[0]` picks an arbitrary edition — often a foreign one — which would
 * overwrite correct data on the audiobookshelf side. Only report these when
 * they are unambiguous.
 */
function pickLanguage(languages) {
  if (!Array.isArray(languages) || !languages.length) return undefined
  if (languages.length === 1) return LANGUAGES[languages[0]] ?? languages[0]
  // Multi-language work: only claim English when English is actually among them.
  if (languages.includes('eng')) return 'English'
  return undefined
}

function pickPublisher(publishers) {
  if (!Array.isArray(publishers) || publishers.length !== 1) return undefined
  return publishers[0]
}

function mapDoc(doc, work) {
  const subjects = partitionSubjects(work?.subjects?.length ? work.subjects : doc.subject)
  const coverId = doc.cover_i ?? work?.covers?.[0]

  const match = {
    title: doc.title,
    subtitle: doc.subtitle,
    author: Array.isArray(doc.author_name) ? doc.author_name.join(', ') : undefined,
    publisher: pickPublisher(doc.publisher),
    // The original publication year — the main thing Audible metadata lacks.
    publishedYear: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
    description: extractDescription(work),
    cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
    isbn: pickIsbn(doc.isbn),
    genres: subjects.genres.length ? subjects.genres : undefined,
    tags: subjects.tags.length ? subjects.tags : undefined,
    series: subjects.series.length ? subjects.series : undefined,
    language: pickLanguage(doc.language)
  }

  for (const key of Object.keys(match)) {
    if (match[key] === undefined || match[key] === null || match[key] === '') delete match[key]
  }
  return match
}

/**
 * Rank candidates so the most plausible edition surfaces first. Open Library
 * returns omnibuses and box sets alongside the real work; `edition_count` is a
 * decent proxy for "this is the canonical record", and an exact title match
 * outranks a partial one.
 */
function scoreDoc(doc, title) {
  const normalise = (v) => (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const wanted = normalise(title)
  const got = normalise(doc.title)

  let score = 0
  if (got === wanted) score += 100
  else if (got.startsWith(wanted) || wanted.startsWith(got)) score += 50
  else if (got.includes(wanted)) score += 20

  // Long compilation titles are usually the wrong record.
  if (got.length > wanted.length * 2.5) score -= 40

  score += Math.min(doc.edition_count ?? 0, 40) / 4
  if (doc.cover_i) score += 5
  if (doc.first_publish_year) score += 3
  return score
}

async function searchOpenLibrary({ query, author, isbn }) {
  const cacheKey = JSON.stringify({ query, author, isbn })
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const params = new URLSearchParams({ fields: SEARCH_FIELDS, limit: '10' })
  if (isbn) {
    params.set('isbn', isbn)
  } else {
    params.set('title', query)
    if (author) params.set('author', author)
  }

  const data = await olFetch(`${OL_BASE}/search.json?${params}`)
  let docs = Array.isArray(data?.docs) ? data.docs : []

  // An ISBN or title+author search can come back empty for audiobook-only
  // editions; retry as a loose full-text query before giving up.
  if (!docs.length && query) {
    const fallback = new URLSearchParams({ fields: SEARCH_FIELDS, limit: '10', q: author ? `${query} ${author}` : query })
    const retry = await olFetch(`${OL_BASE}/search.json?${fallback}`)
    docs = Array.isArray(retry?.docs) ? retry.docs : []
  }

  const ranked = docs
    .filter((doc) => doc?.title)
    .map((doc) => ({ doc, score: scoreDoc(doc, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
    .map((entry) => entry.doc)

  // Descriptions live on the work record, so fetch a few in parallel.
  const works = await Promise.all(ranked.map((doc, index) => (index < MAX_DESCRIPTION_FETCHES && doc.key ? olFetch(`${OL_BASE}${doc.key}.json`) : Promise.resolve(null))))

  const matches = ranked.map((doc, index) => mapDoc(doc, works[index]))
  cacheSet(cacheKey, matches)
  return matches
}

// -------------------------------------------------------------- server ----

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

const server = createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  } catch {
    return sendJson(res, 400, { error: 'Bad request' })
  }

  if (url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', cacheEntries: cache.size })
  }

  if (url.pathname !== '/search') {
    return sendJson(res, 404, { error: 'Not found' })
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  if (API_KEY && req.headers.authorization !== API_KEY) {
    return sendJson(res, 401, { error: 'Unauthorized' })
  }

  const query = url.searchParams.get('query')?.trim()
  const author = url.searchParams.get('author')?.trim() || undefined
  const isbn = url.searchParams.get('isbn')?.trim() || undefined
  const mediaType = url.searchParams.get('mediaType') ?? 'book'

  if (!query && !isbn) {
    return sendJson(res, 400, { error: 'query is required' })
  }
  // Open Library has no podcast data; answer honestly rather than guessing.
  if (mediaType !== 'book') {
    return sendJson(res, 200, { matches: [] })
  }

  try {
    const matches = await searchOpenLibrary({ query, author, isbn })
    console.log(`[search] "${query}"${author ? ` by ${author}` : ''} -> ${matches.length} match(es)`)
    return sendJson(res, 200, { matches })
  } catch (error) {
    console.error('[search] failed:', error)
    return sendJson(res, 500, { error: 'Upstream lookup failed' })
  }
})

server.listen(PORT, () => {
  console.log(`Open Library provider listening on http://localhost:${PORT}`)
  console.log(`  auth: ${API_KEY ? 'required (Authorization header)' : 'disabled (set PROVIDER_API_KEY to enable)'}`)
})
