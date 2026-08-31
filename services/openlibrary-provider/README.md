# Open Library metadata provider

A metadata enrichment service for audiobookshelf, backed by [Open Library](https://openlibrary.org).

It implements audiobookshelf's custom metadata provider contract (`audiobookshelf/custom-metadata-provider-specification.yaml`), so audiobookshelf treats it like any built-in provider — VoxSilo never talks to Open Library directly.

Plain Node, no dependencies.

## Why

The Libation sidecars already give excellent *audiobook* metadata. What they cannot give is anything about the **work**:

| | Libation / Audible | Open Library |
| --- | --- | --- |
| ISBN | never present | yes |
| Publication year | audiobook release date | original publication year |
| Subjects | Audible's marketing categories | library subject headings |
| Covers | audiobook cover | print edition covers |

## Running

```bash
PROVIDER_API_KEY="$(openssl rand -hex 32)" PORT=3444 node services/openlibrary-provider/index.mjs
```

| Env | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3444` | Listen port |
| `PROVIDER_API_KEY` | unset | If set, requests must send it in the `Authorization` header |
| `OL_BASE` | `https://openlibrary.org` | Upstream base URL |

`GET /health` returns status and cache size.

## Registering with audiobookshelf

One-time; it persists in the audiobookshelf database.

```bash
curl -X POST "http://localhost:3333/audiobookshelf/api/custom-metadata-providers" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Open Library","url":"http://localhost:3444","mediaType":"book","authHeaderValue":"<the same key you started the service with>"}'
```

`mediaType` is required — omitting it returns a bare `Invalid request body`.

The provider is then addressed as `custom-<id>`; the id comes from `GET /api/custom-metadata-providers`. Note that listing returns raw rows **without** the computed `slug`, so build it yourself.

## Endpoint

```
GET /search?mediaType=book&query=<title>&author=<author>&isbn=<isbn>
Authorization: <api key>
```

```json
{ "matches": [ { "title": "…", "author": "…", "publishedYear": "2007", "isbn": "…",
                 "description": "…", "cover": "https://covers.openlibrary.org/…",
                 "genres": ["…"], "tags": ["…"], "series": [{"series": "…"}], "language": "English" } ] }
```

Requests are cached for an hour and capped at 5 matches, with descriptions fetched for the top 3 only — Open Library rate-limits, and descriptions need a second request per work.

## Data quality, and why the UI asks before writing

Open Library is crowd-sourced and its search index flattens **every edition of a work into one document**. Fields that look scalar are really unordered lists spanning all translations. The service defends against this:

- **Publisher** is reported only when a work has exactly one. Otherwise `[0]` is an arbitrary edition — for *The Final Empire* it returns a Catalan publisher, which would overwrite the correct "Macmillan Audio".
- **Language** is only claimed when unambiguous, or when English is genuinely among the editions.
- **ISBN** prefers registration groups 0 and 1 (`978-0…`, `978-1…`), the English-language groups. Without this you get whichever translation sorts first — a Turkish edition, in testing.

Some errors are simply upstream and cannot be defended against: Open Library reports `first_publish_year` **2001** for *The Final Empire*, which was published in 2006.

This is why VoxSilo's **Enrich metadata** dialog reviews changes field by field, splitting them into **Add** (pre-selected, purely additive) and **Replace** (never pre-selected). Enrichment can only improve a book unless you deliberately opt into an overwrite.

## Adding other providers

The contract is small enough that a Goodreads, Hardcover or Google Books provider is the same shape: implement `GET /search`, return `{ matches }`, register the URL. audiobookshelf normalises and validates the response, so a provider cannot inject unexpected fields.
