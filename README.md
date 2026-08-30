# VoxSilo

A modern, self-hosted audiobook player built on [audiobookshelf](https://github.com/advplyr/audiobookshelf) — Kibo UI, TypeScript, and Tailwind CSS v4 in place of the stock Nuxt client.

VoxSilo is a hard fork of audiobookshelf's client. The Express/Sequelize/Socket.IO server is kept as-is and its HTTP API is treated as a public contract — VoxSilo is not the only client that talks to it; the [official audiobookshelf app](https://www.audiobookshelf.org/) and third-party clients (ShelfPlayer, Absorb, SoundLeaf) work against the same server. The Nuxt 2 / Vue 2 client has been replaced with a React 19 SPA.

## Layout

```
VoxSilo/
├── LICENSE                    GPL-3.0, inherited from upstream audiobookshelf
├── .mcp.json                  Kibo UI MCP server (project-scoped)
├── docs/PLAN.md                Roadmap — what's built, what's left, in what order
├── media/audiobooks/           Local dev library — drop Libation output here (see its README)
├── scripts/                    libation-to-abs.mjs — sidecar → abs metadata.json
├── services/openlibrary-provider/  Metadata enrichment service (see its README)
└── audiobookshelf/             The fork
    ├── server/                 Upstream Express server — unmodified except static-serving routes
    ├── client/                 NEW React + Vite client
    ├── client-legacy/          Original Nuxt 2 client, kept for reference
    └── dev.js                  Local dev config (gitignored)
```

`client-legacy/` is a porting reference only. It is not built and not served; delete it once the port is complete (or see `docs/PLAN.md` — it may get pressed into service as a temporary admin UI first).

audiobookshelf/ was originally a separate clone of upstream on its own branch; it has since been folded into this repo as a normal directory so the whole project lives in one place and one history. It started from a shallow, single-commit clone, so no meaningful git history was lost in the flattening. To check for upstream changes, diff against a fresh clone of `advplyr/audiobookshelf` rather than `git pull` — there is no longer a tracking remote for it.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 (SPA, `ssr: false` equivalent) |
| Styling | Tailwind CSS v4 (CSS-first, no config file) |
| Components | shadcn/ui (new-york, CSS variables) + Kibo UI |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| Routing | React Router 7 |

Vite is used rather than Next.js deliberately: audiobookshelf ships as a single self-hosted Express process that serves the client statically from `client/dist`. A SPA drops into that model unchanged, so the Docker image and single-binary packaging keep working.

## Running locally

Two processes. The server first:

```bash
cd audiobookshelf && node index.js --dev
```

Then the client, which proxies API/socket traffic to it:

```bash
cd audiobookshelf/client && npm run dev
```

The app is at <http://localhost:3000/audiobookshelf>. The server listens on `:3333`.

On a fresh database, create the root user before signing in:

```bash
curl -X POST http://localhost:3333/audiobookshelf/init -H "Content-Type: application/json" -d '{"newRoot":{"username":"voxsilo","password":"CHANGE_ME"}}'
```

### Base path

The server mounts everything under `ROUTER_BASE_PATH` (default `/audiobookshelf`), so Vite's `base` is set to match and `import.meta.env.BASE_URL` is the single source of truth in `src/lib/config.ts`. Change one and you must change the other.

### Content

Audiobooks only. Podcasts, the ebook/comic reader, public share links, and RSS/email delivery are all out of scope by decision — see `docs/PLAN.md`. The server still ships all of that and its API returns podcast-shaped media, so the client keeps a small amount of defensive podcast normalisation (`toDisplay` in `BookCard.tsx`, the icon choice in `Sidebar.tsx`) rather than assuming every item is a book. **The server side of this is never touched** — the API is a public contract shared with the official audiobookshelf app and third-party clients, so cuts happen in the UI only.

Test content goes in [`media/audiobooks/`](media/audiobooks/README.md), which documents the folder layout audiobookshelf expects and the Libation naming templates that produce it.

### ffmpeg

`dev.js` deliberately does **not** set `SkipBinariesCheck`. Audiobookshelf's `BinaryManager` downloads ffmpeg and ffprobe from ffbinaries on first boot and caches them in `audiobookshelf/` (~120 MB each, gitignored). Setting `SkipBinariesCheck` lets the server start without them, but scanning and playback then fail.

## Building

```bash
cd audiobookshelf/client && npm run build
```

Output goes to `client/dist`, which is exactly where the Express server expects it (`server/Server.js`). `npm run generate` is aliased to the same thing so the upstream root script (`npm run client`) and the Dockerfile keep working unchanged.

## Kibo UI

The MCP server is configured in `.mcp.json` at the repo root. It is picked up when a session starts in this directory — restart your session after cloning.

Components install through the shadcn CLI using the `@kibo-ui` namespace registered in `client/components.json`:

```bash
cd audiobookshelf/client && npx shadcn@latest add @kibo-ui/dropzone
```

Kibo components land in `src/components/kibo-ui/`, shadcn primitives in `src/components/ui/`. Both are vendored source — edit them freely.

> Note: Kibo's registry occasionally emits a monorepo-internal import (`@repo/shadcn-ui/...`) that will not resolve here. `spinner` needed this fix. If a newly added component fails to typecheck, check its imports first and repoint them at `@/components/ui/...`.

## Design tokens

`src/index.css` owns the palette as OKLCH custom properties, dark-first. Two accents carry meaning:

- `--primary` (violet) — ordinary interactive elements
- `--playing` (warm amber) — playback state: progress bars, "currently playing", finished badges

Use `bg-playing` / `text-playing` for anything that means "this is being listened to", so playback never reads as just another primary action.

## Status

Implemented and verified against a live server holding real Libation-ripped audiobooks:

- Sign in / sign out, session restore from the httpOnly refresh cookie, transparent access-token refresh with single-flight deduplication
- App shell: responsive mobile nav, command palette (⌘K), theme switching (light/dark/system)
- Sidebar: Continue Listening with progress, progress filters (all / in progress / not started / finished) with live counts, top genres, library totals
- Library browse: infinite-scroll grid, sort, in-library search, URL-driven filtering, skeleton and empty states, cover fallbacks
- Series: sidebar list, a group-by-series toggle that collapses each set into one stacked card, and a series page listing books in reading order with sequence badges
- Item detail: cover, linked series, narrator, duration, chapter count, publisher, description, progress
- Player: persistent bar with chapter navigation, ±15/30s skip, variable speed, volume, a chapter list, keyboard shortcuts, OS media-key integration, and progress synced to the server every 15s
- Metadata enrichment from Audible, Google Books, Open Library and iTunes, reviewed field by field

The sidebar deliberately has no library switcher — VoxSilo is single-library by design, so that space goes to filters and listening state instead.

Not yet built: collections/playlists/authors views, admin and config screens, and Socket.IO live updates. Full roadmap, scope decisions, and known bugs (including two in the production static-route fallback) are in [`docs/PLAN.md`](docs/PLAN.md).

### How playback works

Audiobookshelf models a book as ordered audio tracks each carrying a `startOffset`. `src/stores/player.ts` presents one continuous timeline and maps it onto whichever track is loaded, so chapters, seeking and progress behave identically for a one-file book and a ninety-file one. The `<audio>` element is a module singleton, not React state — it has to survive route changes.

Track URLs are authenticated and an `<audio>` element cannot send headers, so the access token goes in the query string. That is the mechanism the server provides for this (`ExtractJwt.fromUrlQueryParameter('token')` in `server/Auth.js`) and what the upstream client does; it does mean tokens appear in request URLs.

Position is reported to `POST /api/session/:id/sync` every 15s while playing, and on pause, close and book switch. Audiobookshelf derives progress and "finished" from that.

**Playback does not survive a page reload** — the session lives in memory, so a refresh drops the player and you resume from the book. Progress is safe; only the active session is lost.

### Metadata conversion

`scripts/libation-to-abs.mjs` translates Libation's Audible sidecar into an audiobookshelf `metadata.json`, which the scanner does read. This is what makes series work: the ID3 `SERIES`/`PART` tags split multi-book sets across the wrong series with no usable order, while the sidecar carries the correct series and a per-book sequence. It also recovers descriptions, full genre lists, publisher and publication date.

```bash
node scripts/libation-to-abs.mjs "D:/Projects/VoxSilo/media/audiobooks" --dry-run
```

Details in [`media/audiobooks/README.md`](media/audiobooks/README.md).

### Metadata enrichment

[`services/openlibrary-provider`](services/openlibrary-provider/README.md) is a small dependency-free service implementing audiobookshelf's custom metadata provider contract, backed by Open Library. It supplies what Audible metadata cannot: ISBNs, original publication years, and library subject headings.

```bash
PROVIDER_API_KEY=voxsilo-dev-ol-key node services/openlibrary-provider/index.mjs
```

It is registered once in the audiobookshelf database, then reachable from the **Enrich metadata** button on any item page. Because Open Library is crowd-sourced and its search index flattens all editions of a work together, the dialog reviews every field and splits changes into **Add** (pre-selected) and **Replace** (never pre-selected) — enrichment cannot silently downgrade Libation's better data.

### Known gaps

- The bundle is one ~690 kB chunk and wants code-splitting.
- Series ordering depends on the converted metadata; books added without running the converter fall back to whatever the ID3 tags say.
- Two routes 404 on a hard refresh in production (`/series/:id`, bare `/library`) — the server's static-file fallback list predates these routes. See `docs/PLAN.md`.

## License

GPL-3.0, inherited from upstream [audiobookshelf](https://github.com/advplyr/audiobookshelf) — see [`LICENSE`](LICENSE). Any fork of GPL-licensed code stays GPL.
