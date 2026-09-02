# Athenaeum

**A self-hosted audiobook player that feels like it was built this decade — because it was.**

Athenaeum is a ground-up modernization of the [audiobookshelf](https://github.com/advplyr/audiobookshelf) web experience. It keeps everything that makes audiobookshelf great — the battle-tested Express server, your library, your listening progress, and the HTTP API that the official mobile app and third-party clients (ShelfPlayer, Absorb, SoundLeaf) already speak — and replaces the aging Nuxt 2 frontend with a fast, polished React 19 single-page app.

Your server. Your books. A brand-new face.

![Library view](docs/screenshots/library.png)

![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)
![Vite 7](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss&logoColor=white)
![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue)

## Why Athenaeum?

Audiobookshelf's server is superb. Its web client, though, is a Nuxt 2 app on a Vue 2 foundation — a framework that reached end-of-life at the end of 2023. Rather than patch around it, Athenaeum rebuilds the entire client on a modern stack while treating the server API as a sacred, unchanged contract:

| | Upstream client | Athenaeum |
| --- | --- | --- |
| **Framework** | Nuxt 2 / Vue 2 (EOL) | React 19 + TypeScript 5.9 |
| **Build tool** | Webpack (via Nuxt 2) | Vite 7 — instant HMR, fast builds |
| **Styling** | Legacy Tailwind config | Tailwind CSS v4, CSS-first, OKLCH design tokens |
| **Components** | Hand-rolled Vue components | shadcn/ui + Kibo UI + Radix primitives |
| **Data layer** | Vuex-era patterns | TanStack Query v5 + Zustand |
| **Search** | Client-side jump list | ⌘K command palette backed by real server search |
| **Branding** | Fixed | Rename the whole app from admin settings — no rebuild |
| **Server & API** | — | **Untouched.** Same database, same endpoints, same mobile apps |

The payoff: the Docker image, your existing library, your listening history, and every mobile client keep working exactly as before — but the browser experience is transformed.

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/screenshots/item-detail.png" alt="Item detail page"><br><sub>Item detail — metadata, chapters, and every action in one place</sub></td>
<td width="50%"><img src="docs/screenshots/player-bar.png" alt="Persistent player bar"><br><sub>A persistent player bar that survives navigation across the app</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/now-playing.png" alt="Now Playing screen"><br><sub>Full-screen Now Playing, opened from the player bar</sub></td>
<td width="50%"><img src="docs/screenshots/command-palette.png" alt="Command palette search"><br><sub>⌘K search across titles, authors, narrators, and series</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/help.png" alt="Help and mobile app setup page"><br><sub>Dynamic connection info for compatible mobile apps</sub></td>
<td width="50%"><img src="docs/screenshots/system-settings.png" alt="Admin branding settings"><br><sub>Runtime-configurable branding — no rebuild required</sub></td>
</tr>
</table>

## Highlights

- 🎧 **A player worth living in** — persistent bar plus a full-screen Now Playing view, chapter navigation, variable speed, configurable skips, keyboard shortcuts, OS media-key integration, a sleep timer, bookmarks, and an "Up next" prompt for the next book in a series
- 📚 **Library browsing that scales** — infinite-scroll grid, sort, in-library search, URL-driven filters, series grouping with reading order, collapsible sidebar filters for genres/authors/narrators
- ⌘K **Real search** — a command palette backed by the server's own search index, not a client-side jump list
- ✨ **Metadata superpowers** — a full item editor, a chapter editor, a cover picker across seven providers, and field-by-field enrichment from Audible, Google Books, Open Library, and iTunes — reviewed before anything is written
- ☑️ **Bulk actions** — multi-select on the grid for collection/playlist add, finished/unread, tag/genre edits, and delete, across many books at once
- 🗂️ **Collections & playlists** — shared admin-curated shelves and personal per-user playlists, both drag-to-reorder
- 🔢 **Series order you can actually fix** — a series page flags books with a missing or duplicated position and opens a drag-to-reorder editor, so a set that scanned in the wrong order is repaired in the UI instead of by hand-editing metadata files
- 🔄 **Live sync** — edit metadata in another browser, or listen on your phone, and open pages update over Socket.IO without a reload; a session closed elsewhere stops playback here instead of silently desyncing
- 🛠️ **A real admin surface** — library settings, user management, backups & logs, scan status — all in the UI, no `ssh` or `curl` required
- 📡 **Activity at a glance** — an admin page showing who is connected and on how many devices, what each person is listening to right now and how far in, when everyone was last seen, and what has been played recently; it updates live as people connect and start or stop listening
- 📊 **Listening stats** — total time, a 14-day activity chart, day-of-week breakdown, and recent sessions
- 📱 **Mobile-app onboarding** — a Help page with your server's live connection details and links to every compatible client
- 🏷️ **Runtime branding** — "Athenaeum" isn't load-bearing; rename the app from Settings → System with no rebuild

The sidebar deliberately has no library switcher — Athenaeum is single-library by design, so that space goes to filters and listening state instead. Podcasts, the ebook/comic reader, public share links, and RSS/email delivery are out of scope by decision; the server still supports all of it for other clients. Full history, scope decisions, and known bugs are tracked in [`docs/PLAN.md`](docs/PLAN.md).

## Quick start

### Docker (recommended)

Build this fork's image — upstream's Dockerfile works unmodified, bundling the new client and the untouched server into one image:

```bash
cd audiobookshelf && docker build -t athenaeum:local .
```

```bash
docker run -d --name athenaeum -p 13378:80 \
  -v ./docker-data/config:/config \
  -v ./docker-data/metadata:/metadata \
  -v /path/to/your/audiobooks:/audiobooks \
  --restart unless-stopped \
  athenaeum:local
```

Verified against a real 175-book library: build, root-user init, library creation, and a full scan all complete cleanly, matching the dev-server library exactly. A `docker-compose.local.yml` following this shape (with real host paths) is a reasonable way to keep the settings around; it's gitignored since it'll hardcode machine-specific paths. Note that the checked-in `docker-compose.yml` is upstream's example and points at the public `ghcr.io/advplyr/audiobookshelf` image — build locally to run *this* fork.

### Development

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
curl -X POST http://localhost:3333/audiobookshelf/init -H "Content-Type: application/json" -d '{"newRoot":{"username":"admin","password":"CHANGE_ME"}}'
```

## Contents

- [Stack](#stack)
- [Layout](#layout)
- [Configuration](#configuration)
- [Building](#building)
- [Testing](#testing)
- [CI/CD](#cicd)
- [How it works](#how-it-works)
- [Kibo UI](#kibo-ui)
- [Design tokens](#design-tokens)
- [Known gaps](#known-gaps)
- [License](#license)

## Stack

| Concern | Choice |
| --- | --- |
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 (SPA) |
| Styling | Tailwind CSS v4 (CSS-first, no config file) |
| Components | shadcn/ui (new-york, CSS variables) + Kibo UI |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| Routing | React Router 7 |

Vite rather than Next.js is deliberate: audiobookshelf ships as a single self-hosted Express process that serves the client statically from `client/dist`. A SPA drops into that model unchanged, so the Docker image and single-binary packaging keep working.

## Layout

```
Athenaeum/
├── LICENSE                    GPL-3.0, inherited from upstream audiobookshelf
├── .mcp.json                  Kibo UI MCP server (project-scoped)
├── docs/
│   ├── PLAN.md                 Roadmap — what's built, what's left, in what order
│   └── screenshots/             Images used in this README
├── media/audiobooks/           Local dev library — drop Libation output here (see its README)
├── scripts/                    libation-to-abs.mjs — sidecar → abs metadata.json (--watch to keep up)
├── services/openlibrary-provider/  Metadata enrichment service (see its README)
└── audiobookshelf/             The fork
    ├── server/                 Upstream Express server — unmodified except one additive
    │                           settings field (see Configuration) and static-serving routes
    ├── client/                 React + Vite client
    └── dev.js                  Local dev config (gitignored)
```

`audiobookshelf/` started as a separate clone of upstream on its own branch and has since been folded into this repo as a normal directory, so the whole project lives in one place and one history. It began as a shallow, single-commit clone, so no meaningful git history was lost in the flattening. To check for upstream changes, diff against a fresh clone of `advplyr/audiobookshelf` rather than `git pull` — there is no longer a tracking remote for it.

## Configuration

### Base path

The server mounts everything under `ROUTER_BASE_PATH` (default `/audiobookshelf`), so Vite's `base` is set to match and `import.meta.env.BASE_URL` is the single source of truth in `src/lib/config.ts`. Change one and you must change the other.

### Renaming the app

"Athenaeum" isn't load-bearing anywhere. There are two layers, and most deployers only need the first:

- **Runtime, admin-configurable (no rebuild):** sign in as an admin and set it under Settings → System → Branding. This PATCHes the server's own `/api/settings` and persists in its database, so it's visible to every browser that connects to this server — not just yours. This is the one deliberate exception to "the server is never touched" below: `server/objects/settings/ServerSettings.js` gained one additive field, `customAppName` (constructor default, load-from-db, and `toJSON()`), so it round-trips through the existing admin-settings endpoint like any other server setting (`authLoginCustomMessage` is the precedent this follows). No existing field or endpoint behavior changed.
- **Build-time default (no server, no login):** create `client/.env.local` (gitignored) with `VITE_APP_NAME=Your Name Here`. This is what's shown before anyone signs in (the sign-in screen itself, the initial tab title) and what a signed-in browser falls back to if no admin override is set. `client/.env` holds the committed default (`Athenaeum`) — edit `.env.local`, not `.env`, so a rebrand doesn't turn into a merge conflict against upstream changes to this fork. `npm run dev` picks up a changed `.env.local` on its own; a production build needs a rebuild to bake it into `dist/`.

`src/stores/auth.ts`'s `useAppName()`/`getAppName()` resolve both layers in one place — admin override first, build-time default otherwise — and everything that displays the name (sidebar, sign-in screen, tab title, the client name/device id a listening session reports to the server, the Help page's copy) reads from there.

### Content

Audiobooks only. Podcasts, the ebook/comic reader, public share links, and RSS/email delivery are all out of scope by decision — see `docs/PLAN.md`. The server still ships all of that and its API returns podcast-shaped media, so the client keeps a small amount of defensive podcast normalisation (`toDisplay` in `BookCard.tsx`, the icon choice in `Sidebar.tsx`) rather than assuming every item is a book. **The server side of this is never touched** — the API is a public contract shared with the official audiobookshelf app and third-party clients, so cuts happen in the UI only.

Test content goes in [`media/audiobooks/`](media/audiobooks/README.md), which documents the folder layout audiobookshelf expects and the Libation naming templates that produce it.

The library's folder list isn't hardcoded — manage it from the app itself at **Library settings** (account menu → Library settings, admin only).

### ffmpeg

`dev.js` deliberately does **not** set `SkipBinariesCheck`. Audiobookshelf's `BinaryManager` downloads ffmpeg and ffprobe from ffbinaries on first boot and caches them in `audiobookshelf/` (~120 MB each, gitignored). Setting `SkipBinariesCheck` lets the server start without them, but scanning and playback then fail.

## Building

```bash
cd audiobookshelf/client && npm run build
```

Output goes to `client/dist`, which is exactly where the Express server expects it (`server/Server.js`). `npm run generate` is aliased to the same thing so the upstream root script (`npm run client`) and the Dockerfile keep working unchanged.

For the Docker build, see [Quick start](#quick-start). `/config` and `/metadata` in the container are separate from the `dev-config`/`dev-metadata` used by `npm run dev` — the two don't share a database.

### Bundle size

Upfront JavaScript is roughly 188 kB gzipped: the entry chunk plus a `react-core` chunk holding
just the React runtime, so an app-only release never invalidates the cached copy of it. Everything
else is left to Rollup's default placement, which keeps a dependency with the lazy route that
imports it — a blanket `node_modules → vendor` rule here previously dragged them all into the
first paint.

Before arguing about bundle size, measure it:

```bash
cd audiobookshelf/client && ANALYZE=1 npm run build   # writes dist/stats.html
```

## Testing

```bash
cd audiobookshelf/client && npm test
```

Unit tests (Vitest) over pure logic — filter encoding, duration/clock/byte formatting, the player's track/global-time mapping, the live-sync event → query-key table, series-order health, and the series-sequence merge that keeps a book's other series intact. No server needed.

```bash
cd audiobookshelf/client && npm run lint && npm run typecheck
```

Lint passes clean. The remaining warnings are React Compiler diagnostics (`react-hooks` v6) on the sync-a-draft-from-a-prop effect most edit forms here use — real debt to pay down deliberately, kept visible rather than errored out or switched off.

```bash
cd audiobookshelf/client && E2E_USERNAME=... E2E_PASSWORD=... npm run test:e2e
```

Playwright tests over sign-in → browse → play, live sync, and series reordering, against a real running server and real library (both processes from [Quick start](#quick-start) need to already be up). Point it elsewhere with `E2E_BASE_URL`, and set `E2E_CHROMIUM_PATH` if the environment ships its own Chromium.

Use a disposable account and library, not your own — these start playback, rewrite one book's title and series sequences, and create a collection, restoring what they changed afterwards.

Every spec signs in for real and the server rate-limits authentication (40 attempts per 10 minutes), so repeated full-suite runs start failing with "Too many authentication requests". Start the dev server with `RATE_LIMIT_AUTH_MAX=0` while iterating on them.

## CI/CD

Two independent pipelines — a cloud one for correctness, a local one for actually running the thing.

### GitHub Actions

[`.github/workflows/ci.yml`](.github/workflows/ci.yml). On every push or PR against `main`: typecheck, unit tests, and a production build — the fast safety net. On an actual push to `main`, once that passes, a second job builds this fork's Docker image and pushes it to GHCR (`ghcr.io/<owner>/<repo>`), tagged `:latest` and with the short commit SHA. No config needed beyond the repo's own built-in `GITHUB_TOKEN`.

### Local auto-deploy

Rebuilds and restarts a real container on *this* machine on every push to `main` — no GitHub-hosted runner has your Docker daemon or your library. The chain:

```
GitHub push to main
  → webhook (registered on the repo, HMAC-signed)
  → https://<your-tailnet-node>.ts.net/webhook  (Tailscale Funnel — public HTTPS, real Let's Encrypt cert)
  → scripts/github-webhook-receiver.mjs  (a tiny Node HTTP server, verifies the signature)
  → `act workflow_dispatch -W .github/workflows/local-deploy.yml`  (nektos/act, runs the workflow locally)
  → docker build + docker run  (act mounts the host's own Docker socket, so this is a real image/container, not a throwaway one)
```

[`.github/workflows/local-deploy.yml`](.github/workflows/local-deploy.yml) is deliberately `workflow_dispatch`-only — GitHub itself never runs it; only a local `act` invocation does. It reads `CONFIG_DIR`/`METADATA_DIR`/`AUDIOBOOKS_DIR`/`AUDIOBOOKS2_DIR` from the operator's own environment (via act's `--env-file`), so the committed workflow carries no machine-specific paths.

To set this up on your own machine:

1. Install [act](https://github.com/nektos/act) and Tailscale, and enable [Funnel](https://tailscale.com/kb/1223/funnel) for your tailnet.
2. `tailscale serve --bg 13378` then `tailscale serve --bg --set-path=/webhook 9001` then `tailscale funnel --bg 13378` (Funnel and each serve mount are separate on/off toggles — funnel-ing after adding a mount, not before, is what makes both paths public. On Windows/Git Bash, prefix each with `MSYS_NO_PATHCONV=1` or the leading `/` gets mangled into a filesystem path.)
3. Create `.act.local.env` and `.webhook-secret` at the repo root (both gitignored) — see [`scripts/github-webhook-receiver.mjs`](scripts/github-webhook-receiver.mjs)'s header comment for the exact shape.
4. Register the webhook: `gh api repos/<owner>/<repo>/hooks -X POST -f name=web -F active=true -f events[]=push -f config[url]=https://<your-node>.ts.net/webhook -f config[content_type]=json -f config[secret]=<your secret>`.
5. Run the receiver: `node scripts/github-webhook-receiver.mjs` (logs to stdout and `audiobookshelf/docker-data/local-deploy.log`).

Verified end to end: a real push to `main` reached the receiver over the public Funnel URL, `act` ran `local-deploy.yml` against the host Docker daemon, and the `athenaeum` container was rebuilt and restarted with the real library still correctly mounted.

## How it works

### Playback

Audiobookshelf models a book as ordered audio tracks each carrying a `startOffset`. `src/stores/player.ts` presents one continuous timeline and maps it onto whichever track is loaded, so chapters, seeking and progress behave identically for a one-file book and a ninety-file one. The `<audio>` element is a module singleton, not React state — it has to survive route changes.

Track URLs are authenticated and an `<audio>` element cannot send headers, so the access token goes in the query string. That is the mechanism the server provides for this (`ExtractJwt.fromUrlQueryParameter('token')` in `server/Auth.js`) and what the upstream client does; it does mean tokens appear in request URLs.

Position is reported to `POST /api/session/:id/sync` every 15s while playing, and on pause, close and book switch. Audiobookshelf derives progress and "finished" from that.

**Playback does not survive a page reload** — the session lives in memory, so a refresh drops the player. Progress is safe, and a "Continue listening?" prompt offers to pick the same book back up rather than requiring a trip back to its item page.

### Metadata conversion

`scripts/libation-to-abs.mjs` translates Libation's Audible sidecar into an audiobookshelf `metadata.json`, which the scanner does read. This is what makes series work: the ID3 `SERIES`/`PART` tags split multi-book sets across the wrong series with no usable order, while the sidecar carries the correct series and a per-book sequence. It also recovers descriptions, full genre lists, publisher and publication date.

```bash
node scripts/libation-to-abs.mjs "./media/audiobooks" --dry-run
```

Timing matters more than it looks: audiobookshelf reads `metadata.json` *at scan time*, and its
folder watcher picks a book up as soon as Libation finishes writing it. Converting after the fact
means the first scan already recorded whatever the ID3 tags said. Watch mode closes that window:

```bash
node scripts/libation-to-abs.mjs "./media/audiobooks" --watch --interval=30
```

It polls rather than using `fs.watch`, which is unreliable across platforms and on the network
shares people typically keep a Libation folder on, and it stays dependency-free. A pass that throws
is logged and the watch continues — a watcher that dies on the first half-written folder is worse
than none. `--force` is refused here, since it would rewrite every book on a timer.

Details in [`media/audiobooks/README.md`](media/audiobooks/README.md).

### Live sync

`src/lib/socket-sync.ts` maps the server's Socket.IO events to the React Query keys they make
stale — a declarative table (`keysForEvent`, pure and unit-tested) installed once from `AppShell`.
The server stays the source of truth: the layer never patches cached entities from event payloads,
it only marks queries stale and lets React Query refetch what is actually mounted.

Two things are patched directly into Zustand instead, because no query mirrors them:
`user.mediaProgress` (what the sidebar count, Continue Listening and grid progress bars read) and
the user record itself.

Bursts are coalesced on a 300 ms window measured from the *first* pending event, so a scan
touching hundreds of books is one refetch rather than hundreds — a debounce that reset per event
would starve for the length of the burst.

Progress events from this tab's own playback are deliberately skipped: the player syncs every 15
seconds and the server echoes that back to the sender, so without the guard the grid refetched
twice a minute during playback. Podcast, RSS, metadata-embed and backup events are not subscribed
(out of scope), and neither is `stream_reset`, which only concerns HLS — this client plays files
directly.

### Admin activity

The activity page (account menu → Activity, admins only) reports server state,
not anything the client records. Every figure already existed:

| Shown | Source |
| --- | --- |
| Users online, open connections | `GET /api/users/online` — `SocketAuthority` counts live sockets per user, so "connections" is browser tabs and apps, not streams |
| Listening now, position, session time, device | the same call's `openSessions` — the playback sessions the server holds in memory, each carrying its `deviceInfo` |
| Last seen, joined | the `lastSeen` and `createdAt` the server already keeps on every user |
| Recent sessions | `GET /api/sessions`, the session history table, joined to its user |

No endpoint was added and nothing new is recorded. It stays current from the
`user_online` / `user_offline` / `user_stream_update` events, which the server
sends only to admin clients, with a slow poll as a backstop for the parts no
event announces — a session's position advances every 15 s without one.

### Metadata enrichment

[`services/openlibrary-provider`](services/openlibrary-provider/README.md) is a small dependency-free service implementing audiobookshelf's custom metadata provider contract, backed by Open Library. It supplies what Audible metadata cannot: ISBNs, original publication years, and library subject headings.

```bash
PROVIDER_API_KEY="$(openssl rand -hex 32)" node services/openlibrary-provider/index.mjs
```

It is registered once in the audiobookshelf database, then reachable from the **Enrich metadata** button on any item page. Because Open Library is crowd-sourced and its search index flattens all editions of a work together, the dialog reviews every field and splits changes into **Add** (pre-selected) and **Replace** (never pre-selected) — enrichment cannot silently downgrade Libation's better data.

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

## Known gaps

- **Playback does not survive a page reload.** The session lives in memory, so a refresh drops the player. Progress is safe and a "Continue listening?" prompt — showing the real saved position, not just a title — offers one tap to pick the book back up. It stays a prompt rather than a silent resumption on purpose: starting real playback means calling the server's `/play` endpoint, which has side effects (closes the device's other sessions, shows up in admin activity), so it can't fire automatically just because a tab reloaded.
- **Offline listening covers the core loop, not a full PWA.** "Download for offline" on an item page caches its audio (via a service worker answering Range requests, so scrubbing still works) and its cover; playing a downloaded item works with zero network, and listening time made offline reconciles to the server automatically once back online. What it *doesn't* do: work from a cold app load with no connectivity at all — that needs full app-shell caching, which is app-installability territory (see the next gap) and deliberately out of scope here. Downloaded items also aren't browsable from a dedicated page yet; start one from an item page you've visited before.
- **Mobile web works but isn't the target.** Athenaeum is a desktop/tablet browser app: mobile isn't broken, but there's no PWA install, no background audio, and no expanded mobile Now Playing. Phones are meant to use the official app or a compatible client, which this server still serves.
- **Access tokens appear in stream URLs.** An `<audio>` element cannot send headers, so the token goes in the query string — the mechanism the server provides and what the upstream client does. See [Playback](#playback).

## License

GPL-3.0, inherited from upstream [audiobookshelf](https://github.com/advplyr/audiobookshelf) — see [`LICENSE`](LICENSE). Any fork of GPL-licensed code stays GPL. Enormous thanks to [advplyr](https://github.com/advplyr) and the audiobookshelf contributors for the server this project stands on.
