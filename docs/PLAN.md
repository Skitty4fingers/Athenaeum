# Finishing VoxSilo

Working plan. Counts and bugs below were verified against the running build, not estimated.
Effort figures assume one person and are rough.

---

## Scope, decided

| Question | Decision | Consequence |
| --- | --- | --- |
| Who uses it | Me plus household | Minimal user list (add / remove / reset password). No permissions matrix, no OIDC, no API keys. |
| Mobile listening | Official ABS client + compatible apps (Absorb, SoundLeaf, ShelfPlayer) | VoxSilo is a desktop/tablet browser app. Mobile web must not be *broken*, but gets no expanded now-playing view, no PWA, no background-audio work. |
| Deployment | Docker on a home server | Docker build verification moves early. LAN-reachable, not internet-exposed. |
| First lane | Admin surface | Stop reaching for `curl` before polishing playback. |
| Offline listening | Post-1.0 | Keep the player's track handling storage-agnostic so a cache layer can slot in later. Don't build it now. |

### Cut entirely

- **Ebook / comic reader** — Libation is audio-only. Avoids epub.js, pdf.js, libarchive and a reader surface the size of the player.
- **Podcast support — UI only.** See the constraint below: the *server* keeps its podcast code untouched.
- **Public share links** — no unauthenticated route or out-of-shell layout.
- **RSS feeds, email and e-reader delivery** — three config screens removed.

---

## Hard constraint: the API is no longer ours alone

Choosing the official app and third-party clients makes the audiobookshelf HTTP API a **public
contract**. ShelfPlayer, Absorb and SoundLeaf all speak it. That constrains the whole project:

- **Never change `/api` request or response shapes.** Not to make a screen easier.
- **Podcast removal is UI-only.** Server models, endpoints and scanners stay exactly as they are.
- **Server edits stay confined to static serving.** Today only `Dockerfile` is modified
  (`node:20-alpine` → `node:22-alpine` for Vite 7); `server/` is untouched. The SPA fallback fix
  below will be the first `server/` change, and it touches static routing only.
- Anything genuinely needing a new endpoint should be **additive** — a new route, never a
  changed one.

If VoxSilo ever needs data the API doesn't expose, add a sidecar service (as
`services/openlibrary-provider` already does) rather than editing the API.

---

## Current state

| | |
| --- | --- |
| App code | 3,106 lines across 13 feature modules |
| Working | Auth · shell/palette/theming · browse + filter + search · series grouping and ordering · item detail · metadata enrichment · player |
| Unported | 38 legacy pages, before the cuts above |
| Bundle | 688 kB, single chunk, no splitting |
| Tests | None |

---

## Fix first — ~half a day

Everything here is small and gets worse to fix later.

- [ ] **SPA catch-all fallback** — 30 min
  `/series/:id` and bare `/library` return **404** on direct load in production. The server only
  serves `index.html` for an enumerated list in `server/Server.js`, written for the Nuxt client's
  routes. Never reproduces in dev, because Vite supplies its own fallback — pure dev/prod
  divergence. Replace the list with a catch-all for non-API `GET`s rather than adding two entries.

- [ ] **Stale progress across clients** — 30 min
  `main.tsx` sets `refetchOnWindowFocus: false`. That was fine when VoxSilo was the only client.
  Now that phones write progress through other apps, opening VoxSilo after listening elsewhere
  shows a stale position. Turn focus refetching back on for progress-bearing queries.

- [ ] **Route-level code splitting** — 1–2 h
  688 kB in one chunk, growing with every feature below. `React.lazy` per route plus a vendor chunk.

- [ ] **Error boundary and a real 404 page** — 1 h
  A thrown render error currently blanks the app; the catch-all route silently redirects to `/`.

- [ ] **Rotate the provider API key** — 15 min
  `voxsilo-dev-ol-key` is a placeholder living in the abs database and in shell history.

- [ ] **Verify the Docker build** — 30 min
  Moved up from last, because Docker is the deployment target. The client stage was bumped to
  `node:22-alpine` and has never actually been built.

---

## Phase 1 — Run the server without curl · ~1–2 weeks

Closes the structural gap left when `client/` was replaced: there is currently **no UI at all**
for adding a library, scanning, editing an item, or managing users.

- [ ] **Socket.IO client layer** — 1 d
  Gates live scan progress and cross-client sync. The server emits ~30 events including
  `task_started`, `item_updated`, `series_updated`. Subscribe once, invalidate matching queries.
  Also the durable fix for the stale-progress problem above.

- [ ] **Library settings and scanning** — 2 d
  Folders, metadata precedence, scan button with live progress.

- [ ] **Item metadata editor** — 2 d
  You already need this: Audible's series data put two Mistborn books under the wrong series and
  the only correction path today is a hand-written `PATCH`.

- [ ] **Cover picker and chapter editor** — 2 d
  Cover search across providers plus upload; chapter editing via `/items/:id/chapters`.

- [ ] **Metadata provider management** — half a day
  Register and edit custom providers in the UI instead of the `curl` that set up Open Library.

- [ ] **Household users** — 1 d
  List, add, remove, reset password. No permissions UI.

- [ ] **Account settings** — half a day
  Password change and playback preferences.

---

## Phase 2 — A player you'd live with · ~3–4 days

The playback loop works end to end. These are the gaps you'd hit on day two — scoped down
because phones use the native apps.

- [ ] **Restore the session after reload** — 4 h
  The biggest gap. The session lives in memory, so a refresh drops the player. Progress is safe;
  the player isn't.

- [ ] **Sleep timer** — 3 h
  End of chapter, or a countdown.

- [ ] **Auto-advance to the next book in series** — 3 h
  Series ordering already exists; this is wiring the end-of-book event to the next sequence number.

- [ ] **Bookmarks** — 4 h
  Server endpoints already exist under `/me/item/:id/bookmark`. UI only.

---

## Phase 3 — Browse depth · ~1 week

Parity with the shelves the old client had. Additive and safe to interleave.

- [ ] **Authors and narrators** — 3 d — author detail with photo and book grid; narrator browse.
- [ ] **Collections and playlists** — 3 d — full CRUD plus drag-to-reorder. The only genuinely new interaction model left.
- [ ] **Listening stats** — 1–2 d — read-only presentation over `/me/listening-stats`.
- [ ] **Batch edit and upload** — 2 d — multi-select on the grid; Kibo's dropzone covers upload.

---

## Phase 4 — Ship it · ~3–4 days

- [ ] **Test harness** — 2 d
  Vitest over logic that already has real edge cases: filter encoding, duration formatting, and
  the player's track/global-time mapping. One Playwright pass over sign-in → browse → play.

- [ ] **Accessibility pass** — 1 d
  Keyboard traps, focus order in player and dialogs, labels on icon-only controls, contrast in
  both themes.

- [ ] **Mobile web smoke test** — half a day
  Not a polish pass — just confirming nothing is broken at phone width, since the native apps
  carry real mobile use.

- [ ] **Backups and logs** — half a day
  Thin screens over existing endpoints. Worth having on a home server you don't want to `ssh` into.

---

## Post-1.0

- **Offline downloads** — service worker or IndexedDB audio cache, download management,
  reconciliation on reconnect. Realistically its own phase. Keep the player's track handling
  storage-agnostic in the meantime so this stays possible.
- **PWA install** — only worth it if VoxSilo ever takes over mobile listening.

---

## Open risks

- **Access tokens appear in stream URLs.** An `<audio>` element can't send headers, so the token
  goes in the query string — the mechanism the server provides, and what the upstream client
  does. Acceptable on a LAN; revisit before any internet exposure.
- **Third-party app compatibility is untested by us.** Worth installing one (ShelfPlayer or
  Absorb) early and confirming it still works after the Docker move, so a regression surfaces
  while the cause is obvious.
- **`client-legacy/` is dead weight once Phase 1 lands.** Delete it then; until then it's the
  reference for porting screens.
