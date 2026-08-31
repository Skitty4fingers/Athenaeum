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
    ├── client/                 React + Vite client
    └── dev.js                  Local dev config (gitignored)
```

The original Nuxt 2 client that shipped with upstream is gone — it was kept around as `client-legacy/` purely as a porting reference while the React client was built, and was deleted once the full roadmap (see `docs/PLAN.md`) landed and nothing needed it anymore.

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

### Renaming the app

"VoxSilo" isn't load-bearing anywhere. There are two layers, and most deployers only need the first:

- **Runtime, admin-configurable (no rebuild):** sign in as an admin and set it under Settings → System → Branding. This PATCHes the server's own `/api/settings` and persists in its database, so it's visible to every browser that connects to this server — not just yours. This is the one deliberate exception to "the server is never touched" below: `server/objects/settings/ServerSettings.js` gained one additive field, `customAppName` (constructor default, load-from-db, and `toJSON()`), so it round-trips through the existing admin-settings endpoint like any other server setting (`authLoginCustomMessage` is the precedent this follows). No existing field or endpoint behavior changed.
- **Build-time default (no server, no login):** create `client/.env.local` (gitignored) with `VITE_APP_NAME=Your Name Here`. This is what's shown before anyone signs in (the sign-in screen itself, the initial tab title) and what a signed-in browser falls back to if no admin override is set. `client/.env` holds the committed default (`VoxSilo`) — edit `.env.local`, not `.env`, so a rebrand doesn't turn into a merge conflict against upstream changes to this fork. `npm run dev` picks up a changed `.env.local` on its own; a production build needs a rebuild to bake it into `dist/`.

`src/stores/auth.ts`'s `useAppName()`/`getAppName()` resolve both layers in one place — admin override first, build-time default otherwise — and everything that displays the name (sidebar, sign-in screen, tab title, the client name/device id a listening session reports to the server, the Help page's copy) reads from there.

### Content

Audiobooks only. Podcasts, the ebook/comic reader, public share links, and RSS/email delivery are all out of scope by decision — see `docs/PLAN.md`. The server still ships all of that and its API returns podcast-shaped media, so the client keeps a small amount of defensive podcast normalisation (`toDisplay` in `BookCard.tsx`, the icon choice in `Sidebar.tsx`) rather than assuming every item is a book. **The server side of this is never touched** — the API is a public contract shared with the official audiobookshelf app and third-party clients, so cuts happen in the UI only.

Test content goes in [`media/audiobooks/`](media/audiobooks/README.md), which documents the folder layout audiobookshelf expects and the Libation naming templates that produce it.

The library's folder list isn't hardcoded — manage it from the app itself at **Library settings** (account menu → Library settings, admin only). On the dev machine this library currently has two folders: the test fixture above, and the real Libation output at `C:\Users\Scott\Libation\Books`.

### ffmpeg

`dev.js` deliberately does **not** set `SkipBinariesCheck`. Audiobookshelf's `BinaryManager` downloads ffmpeg and ffprobe from ffbinaries on first boot and caches them in `audiobookshelf/` (~120 MB each, gitignored). Setting `SkipBinariesCheck` lets the server start without them, but scanning and playback then fail.

## Building

```bash
cd audiobookshelf/client && npm run build
```

Output goes to `client/dist`, which is exactly where the Express server expects it (`server/Server.js`). `npm run generate` is aliased to the same thing so the upstream root script (`npm run client`) and the Dockerfile keep working unchanged.

## Testing

```bash
cd audiobookshelf/client && npm test
```

Unit tests (Vitest) over pure logic — filter encoding, duration/clock/byte formatting, the player's track/global-time mapping. No server needed.

```bash
cd audiobookshelf/client && E2E_USERNAME=... E2E_PASSWORD=... npm run test:e2e
```

One Playwright pass over sign-in → browse → play, against a real running server and real library (both processes from **Running locally** above need to already be up). Point it elsewhere with `E2E_BASE_URL`. Use a disposable account, not your own — it starts playing whatever the first book in the grid is.

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
- Player: persistent bar with chapter navigation, configurable skip amounts, variable speed, volume, a chapter list, keyboard shortcuts, OS media-key integration, and progress synced to the server every 15s
- Metadata enrichment from Audible, Google Books, Open Library and iTunes, reviewed field by field
- Full item metadata editor (`/item/:id/edit`, admin-gated): title, people, series with sequence, genres, tags, and every scalar field, writing directly rather than diff-reviewing
- Cover picker (search across seven providers, URL, drag-and-drop upload) and a chapter editor with derived end-times
- Metadata provider management on the Library settings page — add/remove custom providers, no `curl` required
- Live Socket.IO connection, authenticated the same way the server expects; currently drives scan status
- Library settings (`/settings`, admin-gated): folder management, metadata precedence, a scan button with live status, and the auto-finish threshold
- Real search (⌘K): books, authors, narrators, series and genres, backed by the server's own search — not a client-side jump list
- Collapsible sidebar filters for Series, Genres, Authors and Narrators, collapsed by default
- Manual finished/unread toggling, and a Now Playing screen (opened from the player bar) with full-size cover art and transport controls
- Admin-only metadata enrichment; play/resume/finished controls live directly under the cover on the item page
- User management (`/users`, admin-gated): list, add, remove, reset password — no permissions editor by design
- Account settings (`/account`): password change, and playback preferences (default speed, skip amounts) that drive every skip control in the app — player bar, Now Playing screen, keyboard shortcuts, OS media keys
- A "Continue listening?" prompt after a reload instead of silently restarting audio, a sleep timer (duration or end-of-chapter), an "Up next" prompt for the next book in a series, and bookmarks — all reachable from both the player bar and the Now Playing screen
- Author pages (`/author/:id`): photo, bio, and every book by that author, linked from item pages, the sidebar, and search
- Collections (shared, admin-curated shelves) and playlists (personal, per-user): drag-to-reorder, add from any item page, browsable from the sidebar
- Listening stats (`/stats`): total time, a 14-day activity chart, day-of-week breakdown, most-listened books, and recent sessions
- Multi-select on the library grid: add to collection/playlist, mark finished/unread, bulk tag/genre add, and delete (soft delete only — files stay on disk) in one action across many books at once
- Upload (admin-gated): drag audio files in, set title/author/series, and the server builds the folder itself
- Backups and logs (`/system`, admin-gated): create/download/delete backups, and a filterable view of today's server log — nothing here needs `ssh`
- Help & mobile apps (`/help`, every account): dynamic server-address/username connection info for the four compatible mobile clients this README names, plus a short FAQ

The sidebar deliberately has no library switcher — VoxSilo is single-library by design, so that space goes to filters and listening state instead.

All four phases of the roadmap are complete — admin surface, player polish, browse depth, and shipping polish (tests, an accessibility pass, a mobile smoke test, backups/logs). The main thing still open post-1.0 is broader Socket.IO live-sync beyond scan status. Full roadmap, scope decisions, and known bugs are in [`docs/PLAN.md`](docs/PLAN.md).

### How playback works

Audiobookshelf models a book as ordered audio tracks each carrying a `startOffset`. `src/stores/player.ts` presents one continuous timeline and maps it onto whichever track is loaded, so chapters, seeking and progress behave identically for a one-file book and a ninety-file one. The `<audio>` element is a module singleton, not React state — it has to survive route changes.

Track URLs are authenticated and an `<audio>` element cannot send headers, so the access token goes in the query string. That is the mechanism the server provides for this (`ExtractJwt.fromUrlQueryParameter('token')` in `server/Auth.js`) and what the upstream client does; it does mean tokens appear in request URLs.

Position is reported to `POST /api/session/:id/sync` every 15s while playing, and on pause, close and book switch. Audiobookshelf derives progress and "finished" from that.

**Playback does not survive a page reload** — the session lives in memory, so a refresh drops the player. Progress is safe, and a "Continue listening?" prompt offers to pick the same book back up rather than requiring a trip back to its item page.

### Metadata conversion

`scripts/libation-to-abs.mjs` translates Libation's Audible sidecar into an audiobookshelf `metadata.json`, which the scanner does read. This is what makes series work: the ID3 `SERIES`/`PART` tags split multi-book sets across the wrong series with no usable order, while the sidecar carries the correct series and a per-book sequence. It also recovers descriptions, full genre lists, publisher and publication date.

```bash
node scripts/libation-to-abs.mjs "D:/Projects/VoxSilo/media/audiobooks" --dry-run
```

Details in [`media/audiobooks/README.md`](media/audiobooks/README.md).

### Metadata enrichment

[`services/openlibrary-provider`](services/openlibrary-provider/README.md) is a small dependency-free service implementing audiobookshelf's custom metadata provider contract, backed by Open Library. It supplies what Audible metadata cannot: ISBNs, original publication years, and library subject headings.

```bash
PROVIDER_API_KEY="$(openssl rand -hex 32)" node services/openlibrary-provider/index.mjs
```

It is registered once in the audiobookshelf database, then reachable from the **Enrich metadata** button on any item page. Because Open Library is crowd-sourced and its search index flattens all editions of a work together, the dialog reviews every field and splits changes into **Add** (pre-selected) and **Replace** (never pre-selected) — enrichment cannot silently downgrade Libation's better data.

### Known gaps

- The vendor chunk (React, Radix, etc.) is one ~745 kB bundle, loaded upfront — a further split was diminishing returns against the work still ahead when this was decided; route-level code is already split per-page.
- Series ordering depends on the converted metadata; books added without running the converter fall back to whatever the ID3 tags say.

## License

GPL-3.0, inherited from upstream [audiobookshelf](https://github.com/advplyr/audiobookshelf) — see [`LICENSE`](LICENSE). Any fork of GPL-licensed code stays GPL.
