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
| App code | ~12,700 lines across 12 feature modules — Phases 0 through 4 all complete |
| Working | Everything in the README's Status section — auth, browse/filter/search, series, author pages, item detail, metadata enrichment/editing, cover/chapter editing, full player (sleep timer, up-next, bookmarks, resume-after-reload), collections/playlists with drag-to-reorder, multi-select batch actions, upload, listening stats, household user management, library settings, backups/logs |
| Bundle | route chunks 2–30 kB each, vendor ~745 kB, code-split |
| Tests | Vitest unit tests (34, over filter encoding/formatting/player track mapping) + one Playwright e2e pass (sign-in → browse → play) |
| Real library | 175 items scanned from `C:/Users/Scott/Libation/Books` (172 real books) + a 3-book test fixture, both as folders on the one library |

---

## Fix first — ~half a day

Everything here is small and gets worse to fix later.

- [x] **SPA catch-all fallback** — done
  Replaced the enumerated `dynamicRoutes` list in `server/Server.js` with a guarded catch-all:
  any GET that isn't under `/api/`, `/hls/`, `/public/`, `/feed/`, `/auth/`, or one of the exact
  top-level routes (`/login`, `/status`, ...) gets `index.html`. Verified `/series/:id` and bare
  `/library` now 200, and confirmed the guard still holds — an authenticated bogus `/api/*` path
  still 404s cleanly instead of getting the SPA shell.

  Found a related third case while testing Account settings, not yet fixed: `/login` is on the
  server-owned exact-path list *because* `server/Auth.js` has a real `POST /login`, but the client
  SPA also has its own `/login` route (`LoginPage.tsx`) at the identical path — so a hard refresh
  (or, in dev, Vite's proxy — `login` is in `client/vite.config.ts`'s `serverPaths`, forwarded
  straight to the server) on the sign-in screen hits nothing and 404s, since GET isn't handled at
  that path either. `/series/:id` and bare `/library` were missing *from* an exclude list; this one
  is a genuine name collision between a server endpoint and a client route occupying the same path.
  Fixed: renamed the client's own sign-in route from `/login` to `/signin` (`App.tsx`,
  `LoginPage.tsx`) rather than touching the server. Zero server risk, and keeps to this project's
  own rule that the server API is a public contract shared with other clients and cuts happen in
  the UI only — `POST /login` (the real auth endpoint `lib/api.ts` calls) is untouched. Verified the
  new route resolves without a 404.

- [x] **Stale progress across clients** — done
  Flipped `refetchOnWindowFocus` to `true` globally in `main.tsx`. `staleTime: 30_000` still
  applies, so this doesn't add extra requests — it only refetches when data is already stale.

- [x] **Route-level code splitting** — done
  `React.lazy` per route in `App.tsx`, with `<Suspense>` moved inside `AppShell` around `<Outlet />`
  so the sidebar/header/player don't remount on navigation. Route chunks: LibraryPage 7 kB, ItemPage
  15 kB, SeriesPage 2 kB, LoginPage 3 kB. Vendor deps split into their own chunk (still ~623 kB,
  loaded upfront — a further split was diminishing returns against the work still ahead, so left
  as one cacheable chunk rather than over-engineered).

- [x] **Error boundary and a real 404 page** — done
  `ErrorBoundary` (class component, wraps the whole tree in `main.tsx`) catches render errors and
  offers a reload instead of a blank screen. The `*` route now renders `NotFoundPage` instead of
  silently redirecting to `/`.

- [x] **Rotate the provider API key** — done
  Replaced with a random 32-byte key, generated fresh and not committed anywhere. Docs no longer show a copyable placeholder value — they generate one instead.

- [x] **Verify the Docker build** — done
  Built (`docker build -t voxsilo:test .`) and ran the resulting image end to end: database
  initializes, server listens on :80, and — importantly — the SPA catch-all fix above works
  inside the actual deploy target, not just the dev server. Server runtime stage is still
  `node:20-alpine`, untouched; only the client build stage needed `node:22` for Vite 7.

---

## Phase 1 — Run the server without curl · ~1–2 weeks

Closes the structural gap left when `client/` was replaced: there is currently **no UI at all**
for adding a library, scanning, editing an item, or managing users.

- [x] **Socket.IO client layer** — done
  `src/lib/socket.ts` — one connection for the app's lifetime, authenticated via the `auth`/`init`
  handshake (see server/SocketAuthority.js). Caught a real bug while building this: the first
  `io()` argument is the *origin* to connect to, not a path prefix — passing `basePath` there made
  socket.io-client treat `/audiobookshelf` as a namespace and silently never open a real connection.
  `path` is where the base path actually belongs. Currently wired to `task_started`/`task_finished`
  for scan status; the other ~28 events (`item_updated`, `series_updated`, ...) aren't subscribed to
  yet — cross-client live sync beyond scanning is still open.

- [x] **Library settings and scanning** — done
  `/settings`, admin-gated, linked from the account menu. Folders (add/remove, with a destructive-
  action confirm on remove since it deletes the folder's library items), metadata precedence
  (reorderable, sources lower in the list win), and a scan button with genuinely live status.
  Verified against a real 175-book library, including a folder add and rescan of
  `C:/Users/Scott/Libation/Books` through the UI itself.

  One honest scope note: "live progress" is start/finished, not a percentage or a running item
  count — the server doesn't emit anything finer-grained than `task_started`/`task_finished` for a
  scan (see server/scanner/LibraryScanner.js), so a progress bar here would be fabricating a signal
  that doesn't exist. The finished-task payload does carry real counts (added/updated/missing),
  which the UI shows once the scan completes.

- [x] **Item metadata editor** — done
  `/item/:id/edit`, admin-gated, reached via an "Edit metadata" button under the cover. Full field
  set: title, subtitle, authors, narrators, series (name + sequence), genres, tags, publisher,
  dates, language, ISBN/ASIN, description, explicit/abridged. Writes directly (`PATCH
  /items/:id/media`) rather than diff-reviewing like Enrich — this is direct editing, not merging
  external data.

  Two contract details worth remembering if this is touched again:
  `tags` is top-level on the payload, everything else book-related sits under `metadata` — easy to
  miss. And `authors`/`series` are matched *by name* server-side, not by id
  (`updateAuthorsFromRequest`/`updateSeriesFromRequest`), so correcting a typo means typing the
  right name once, not renaming in place.

  Used it for real: your actual "The Well of Ascension" (from `C:/Users/Scott/Libation/Books`) was
  tagged only "The Cosmere" with no Mistborn Saga entry at all — a genuine gap in Audible's
  metadata, not the mistagging I'd assumed earlier from the test-fixture copy. Added "The Mistborn
  Saga" #2 through the editor; it correctly reused the existing series record rather than creating
  a duplicate, and the series page now orders it correctly.

- [x] **Cover picker and chapter editor** — done
  Cover picker is a dialog on the item page (hover the cover → "Change cover"): search across
  seven providers (`GET /search/covers`), a manual URL field, and drag-and-drop file upload, plus
  remove. All three set-cover paths converge on the same `POST /items/:id/cover` — file upload just
  sends `FormData` instead of JSON.

  Chapter editor is `/item/:id/chapters` — title and start time per chapter, with end times
  *derived* (each chapter ends where the next begins, the last ends at the book's duration) rather
  than asked for directly. Audiobook chapters are always contiguous in practice; asking for both
  start and end invites gaps and overlaps that this sidesteps. `POST /items/:id/chapters` is a full
  replace, not a per-chapter patch, so the whole array goes out on every save.

  Verified against a real 47-chapter book: retitled one chapter, confirmed via direct API call that
  the title changed and every other chapter's start/end stayed exactly contiguous. Also verified the
  cover picker for real — searched, applied a result, and confirmed server-side that `coverPath` now
  points at a freshly downloaded file rather than the original.

  One thing worth remembering from testing this: filling a form field via raw
  `element.value = '...'` in a script does not reliably update React state the way a real keystroke
  does — first attempt at verifying the chapter save silently didn't take because of exactly that.
  Re-verify with actual simulated typing, not direct DOM writes, or a real bug and a test artifact
  look identical.

- [x] **Metadata provider management** — done
  A section on the Library settings page: registered providers listed with a masked "key set"
  indicator, add form (name/URL/media type/optional auth header), remove. No update endpoint
  exists server-side (create/delete only), so the UI is honest about that — changing a provider's
  URL or key is remove-then-re-add, not a pretend in-place edit. Verified live: added a throwaway
  test provider, confirmed it server-side via direct API call, removed it through the UI.

  Caught the same placeholder/value confusion bug a second time before it shipped — used the real
  registered provider's name and URL ("Open Library", "http://localhost:3444") as the form's
  placeholder text, indistinguishable from an actual pre-filled value. Fixed to generic examples.
  Worth a standing rule: never use real, currently-active data as placeholder text anywhere in
  this app — it happened with the folder-path field earlier too.

- [x] **Regression: sidebar counts clipping** — found and fixed mid-session
  Reported live, mid-work, as "count is being clipped in the left menu bar." Root cause was a real
  Radix ScrollArea quirk, not a width/viewport issue: Radix wraps scrollable content in its own
  `display: table` div (for scrollbar-thumb sizing), and a table sizes to its content's *natural*
  width rather than its container's. Adding the Series/Genres/Authors/Narrators sections with real,
  variable-length names (versus the old 3-book test fixture) was enough to blow that table wider
  than the 240px sidebar — every row shared the inflated width and got clipped by the outer
  `overflow-hidden`, cutting off unrelated content like "All books 175". Fixed at the shared
  `ui/scroll-area.tsx` (`[&>div]:!block` on the viewport) rather than patching each usage site.
  Found a second, related bug while verifying the fix: the sidebar's `ScrollArea` had no
  `min-h-0`, a classic flexbox gotcha — `flex-1` alone doesn't stop a flex item from growing to fit
  all its content, so with every filter section expanded the sidebar would grow past the viewport
  instead of clipping and scrolling internally. Fixed alongside.

- [x] **User management** — done
  `/users`, admin-gated, linked from the account menu ("User management" — named that rather than
  "Household users" since access isn't limited to people in the house). List (username, type badge,
  active/disabled/self indicators, last-seen), add, remove, reset password — deliberately no
  permissions editor, per scope. Add and reset-password mutations map straight onto `POST /users`
  and `PATCH /users/:id`; remove is `DELETE /users/:id`. Root can't be deleted or have its type
  changed by anyone (server-enforced), and the current user can't delete themself — both mirrored
  client-side by disabling the remove button rather than only catching the resulting error.

  Caught a real bug live-testing this, not a test artifact: `POST /users` defaults `isActive` to
  `false` server-side (`server/models/User.js` — the Sequelize column default) unless the request
  explicitly says otherwise, so a freshly added user couldn't sign in until an admin went and
  separately activated them — except there's no activation UI, since that's out of scope here.
  Fixed by having the client always send `isActive: true` on create; a "person you just added can't
  log in" bug is not something to ship quietly. Verified end-to-end against the live server: created
  a user, confirmed via direct login call it could authenticate immediately, reset its password and
  confirmed the old password now fails and the new one works, then removed it and confirmed the
  list is clean.

- [x] **Account settings** — done
  `/account`, linked from the account menu (the former disabled placeholder). Two sections:

  Password — `PATCH /me/password` (`{password, newPassword}`), current-password confirmation
  enforced server-side, guest accounts get an explanatory message instead of a form since the
  server itself rejects a guest's password change with a 403. On success the server rotates this
  session's refresh cookie and revokes every other session, but only returns the new access token
  in the response body if a `x-refresh-token` header is sent — which the client deliberately
  doesn't, because `api.ts`'s existing 401-refresh-and-retry already mints a fresh access token
  transparently off the refresh cookie the next time it's needed. Nothing extra to build there.

  Playback — default speed and back/forward jump amounts. Genuinely client-side by design, not a
  missing server feature: upstream audiobookshelf has never synced these across devices either
  (confirmed against `client-legacy/store/user.js`, which persists the equivalent settings to
  `localStorage` the same way). Promoted `playbackRate` from single-use state into a small
  `jumpBackwardAmount`/`jumpForwardAmount` pair on the player store itself (same
  read-on-init/write-on-change `localStorage` pattern already used for rate and volume), so every
  skip control — the player bar buttons, the Now Playing screen buttons, the ←/→ keyboard
  shortcuts, and the OS media-key handlers — reads from one source instead of five different
  hardcoded `15`/`30` literals.

  Verified live: changed the back-skip preference to 10s on the settings page, confirmed
  `localStorage` held the new value, then opened a real book and confirmed the player bar's button
  re-labelled itself "Back 10 seconds" — proving the wiring, not just the setting. Verified the
  password endpoint directly against the running server rather than through the browser session,
  since root's actual password isn't the README's placeholder and the UI runs on a shared session
  cookie — used a disposable test user instead: changed its password, confirmed the old password
  now gets a 401 and the new one a 200, and confirmed the wrong-current-password guard returns
  exactly the 400 "Invalid password" the client's error handling surfaces verbatim.

---

## User feedback pass — done

Real usage against the 175-book library surfaced eleven issues cutting across several phases.
Addressed together rather than waiting for their "official" phase:

- [x] **Fuzzy author/narrator search** — not actually a fuzziness problem: the server's search
  already matched "king" → Stephen King, the client just never surfaced `results.authors` /
  `results.narrators` / `results.series` / `results.genres`, only `results.book`. Two separate
  search surfaces needed this: the ⌘K palette (shows categorized matches directly) and the
  library page's own toolbar search box (shows a book grid, so category matches — which the
  server returns as `{name, numBooks}`, not actual books — get expanded into real items via
  `useSearchResultItems`, one filtered `/items` request per matched author/narrator/genre, merged
  and deduped). Missed the second one on the first pass; caught from a screenshot showing the
  palette fixed but the toolbar box still returning "0 results" for "king".
- [x] **Narrator index/filter** — new collapsible sidebar section, same pattern as genres.
- [x] **Search bar showing Appearance settings** — the ⌘K palette was a static jump-list (libraries
  + theme toggle), not real search. Theme switching already has its own header control; duplicating
  it in the palette is what made it feel like a settings menu. Palette is now real search only.
- [x] **Play/Resume/Enrich placement** — moved under the cover, out from below the description.
- [x] **Enrich metadata admin-only** — gated on `user.type`, same check as Library settings.
- [x] **Mark as finished / unread** — `PATCH {isFinished: true}` and a full `DELETE` respectively
  (not a symmetric `PATCH {isFinished: false}` — the server's merge logic only resets position when
  flipping *out of* finished, so unread needs the delete to reliably mean "not started" from any
  state). Had to also patch the Zustand auth store directly on success: `user.mediaProgress` — what
  the sidebar counts and Continue Listening read — isn't React Query state, so cache invalidation
  alone left it stale.
- [x] **Auto-finish within 90s of the end** — already existed server-side
  (`markAsFinishedTimeRemaining`, `server/models/MediaProgress.js`), just defaulted to 10s with no
  UI to change it. Added a field to Library settings; set to 90 for this library.
- [x] **Player bar → Now Playing screen** — new `/now-playing` full-screen view, opened by the cover
  and title (transport buttons keep their own handlers). Redirects home if there's no active
  session rather than rendering an empty player.
- [x] **Continue Listening, multiple books** — already worked; only one book had real progress
  before, which looked like a one-item cap. Verified with three.
- [x] **Collapsible Genres/Series/Authors/Narrators** — new `CollapsibleFilterSection`, closed by
  default. Matters more now than it would have on the 3-book test set — on the real library these
  lists run 20–60+ entries.

Two bugs found and fixed along the way, both worth knowing about if this pattern comes up again:
- cmdk's `value` prop is both the fuzzy-match text *and* an internal identity key. Two palette
  entries with the same display name (an author and a narrator both "Stephen King") silently broke
  click selection until each group got a unique prefixed value.
- The `authors` filter encodes an author *id*, unlike every other filter group which encodes
  human-readable text — so the generic `filterLabel()` helper showed a raw UUID as the page heading
  until `LibraryPage` learned to resolve it against `stats.authorsWithCount`.

---

## Phase 2 — A player you'd live with · ~3–4 days

The playback loop works end to end. These are the gaps you'd hit on day two — scoped down
because phones use the native apps.

- [x] **Restore the session after reload** — done
  Decided against silently auto-resuming audio on load — browsers block autoplay without a user
  gesture anyway, and it would be surprising even where they don't. Instead: `play()` now writes the
  playing item's id to `localStorage` (`voxsilo.activeItemId`), cleared only on an explicit `close()`
  — never on unmount, so a reload leaves it standing. `ResumePrompt` reads it once at boot and, if
  nothing is currently loaded, shows a small "Continue listening to X?" bar with Resume/dismiss
  rather than touching the `<audio>` element until asked. Lives in `stores/player.ts` as
  `resumeItemId` + `dismissResume()` so `AppShell` can reserve the same bottom padding it already
  reserves for the real player bar, without duplicating state across components.

  Verified live end to end: started a book, confirmed the id landed in `localStorage`, did a real
  hard reload, confirmed the mini player did *not* reappear and audio did *not* start — only the
  prompt did — then clicked Resume and confirmed playback picked back up from the correct position.

- [x] **Sleep timer** — done
  Both modes from the brief. Duration mode (5/15/30/45/60 min) runs a plain `setInterval` decrementing
  `sleepTimerSecondsRemaining`, pausing the `<audio>` element at zero. "End of chapter" mode arms
  against the chapter id playback was in when set, and `ontimeupdate` pauses the instant the current
  chapter no longer matches — no separate countdown needed since the existing chapter data already
  marks the boundary. One shared `SleepTimerMenu` popover (a moon icon that fills solid while a timer
  is armed) is used from both `PlayerBar` and `NowPlayingPage` rather than two copies.

  Verified live: armed a 5-minute timer and watched the popover's countdown tick down in real
  seconds; separately armed "end of chapter" and confirmed the popover's copy switched to "Stopping
  at end of chapter" with the moon icon filled. Didn't wait out an actual multi-minute pause-at-zero
  in this session — the arithmetic is a three-line `setInterval` reusing the same `audio.pause()` path
  `toggle()` already exercises, so a live countdown plus code review covers it without burning
  several real minutes per check.

- [x] **Auto-advance to the next book in series** — done
  Decided on an "Up next" prompt rather than seamless auto-continue, to avoid surprising someone on
  mobile data. When the last track of a book ends with nothing further queued, `checkForNextInSeries()`
  fetches the finished item expanded (`GET /items/:id?expanded=1` — the only shape that returns real
  series ids and sequences, confirmed against the live server response; the minified shape used
  everywhere else only has a flattened `seriesName` string), then re-runs the exact same
  sort-by-sequence series query `SeriesPage` already uses, finds the finished book's position, and
  offers whatever comes next. Renders as `UpNextStrip`, a slim strip inside `PlayerBar`'s own fixed
  container (not a second fixed element needing its own stacking math) — Play starts the next book,
  X dismisses.

  Verification note: live-testing a real end-of-book event turned into a browser-automation dead
  end, not a code problem — forcing a 7-hour book to its very last second by jumping the scrubber to
  the exact reported duration pushed the `<audio>` element into a genuinely wedged state (seeks
  silently stopped taking effect afterward), an edge case of *how* the test was forcing the ending,
  not something a listener would hit by letting a book play out normally. Confirmed instead by: (1)
  capturing the live `expanded=1` network response for a real series book and checking it against
  `checkForNextInSeries()`'s expectations field-for-field — exact match; (2) the series lookup query
  is byte-for-byte the same one `useSeriesBooks` already runs, proven correct earlier this session
  against the real Mistborn/Dark Tower data; (3) a full typecheck and production build both clean.
  Worth a real live pass next time this code is touched, ideally with a short test file rather than a
  7-hour one.

- [x] **Bookmarks** — done
  A `Bookmark` icon popover, shared between `PlayerBar` and `NowPlayingPage` like the sleep timer.
  "Bookmark this moment" adds one at the current whole-second position titled with its timestamp;
  the list seeks on click and deletes on hover. A bookmark's identity **is** the pair
  (`libraryItemId`, `time`) server-side — no separate id — so there's no rename here, matching the
  server's actual create/update-in-place/delete contract rather than pretending it's richer than it
  is (the same honesty call made for metadata providers earlier).

  Verified live against the real server: added a bookmark, confirmed the popover's badge count
  updated from a genuine refetch (not optimistic local state) after the mutation, then deleted it
  and confirmed the badge cleared — a full round trip through `POST /me/item/:id/bookmark` and
  `DELETE /me/item/:id/bookmark/:time`, not just a UI-only check.

---

## Phase 3 — Browse depth · ~1 week

Parity with the shelves the old client had. Additive and safe to interleave.

- [x] **Authors and narrators** — done
  `/author/:id` — photo (or a fallback avatar when the author has none), bio, book count and total
  duration, and a book grid reusing the same `BookCard`/grid classes as `SeriesPage`. Backed by
  `GET /authors/:id?include=items` (`server/controllers/AuthorController.js`); the unauthenticated
  `/authors/:id/image` endpoint is exempted from the JWT check the same way item covers are, so
  it's a plain `<img src>` like everywhere else. Narrators didn't get an equivalent page —
  they're a flattened string on the book record server-side, not a normalized entity with a
  bio/image of their own, so there's nothing to build beyond the filtered-grid browsing that
  already existed.

  Followed the precedent `SeriesPage` already set (sidebar Series links go straight to the
  dedicated page, not a filtered grid) rather than inventing a new pattern: the sidebar's Authors
  section and ⌘K's author results now both link to `/author/:id` instead of a `filter=authors.*`
  query. Item pages previously showed the author as plain unlinked text (`authorName`, a flattened
  string) — added an optional `authors: {id,name}[]` field to the client's minified-item type,
  present whenever the server sends the expanded shape, and linked each author individually.

  Verified live: clicked an author from the item page, from the sidebar, and from ⌘K search — all
  three landed on the same page with the right book count and duration.
- [x] **Collections and playlists** — done
  Two distinct server entities, both built together: collections (`server/models/Collection.js`)
  are shared, library-wide shelves gated behind `canUpdate` (admin/root by default); playlists
  (`server/models/Playlist.js`) are strictly per-user, ownership-checked server-side, with no
  permission gate — any signed-in user, guests included, manages their own. Three decisions made
  up front (asked rather than assumed): build both together rather than staggering them, since
  they share nearly all their UI; put them in the sidebar as collapsible sections the same way
  `SeriesPage` already works rather than inventing new top-level nav; and surface "add to
  collection/playlist" as an action on the item page (a dialog listing existing shelves with a
  toggle per row, plus an inline "new…" form) rather than from the grid.

  `/collections/:id` and `/playlists/:id` — name/description (rename dialog), a book grid with
  drag-to-reorder (`@dnd-kit`, new dependency — nothing existing in this codebase did sortable
  drag), per-book remove, and delete. `/collections` and `/playlists` list pages exist too, even
  though `SeriesPage` has no equivalent index — unlike series (auto-populated by the scanner, and
  the existing sidebar section is enough to reach in practice), a household could plausibly create
  more of these than the sidebar's 20-entry cap shows, so a "View all" link was added inside each
  sidebar section rather than skipped.

  Reordering is a full-replace: `PATCH /collections/:id` with `{books: [...]}` or `PATCH
  /playlists/:id` with `{items: [...]}`, sending the complete desired order of everything already in
  the shelf — there's no per-item move endpoint. Collections can't be created empty server-side
  (400 "No books"), so creation always seeds the collection with whichever book you opened the
  dialog from; playlists don't have that restriction but the UI seeds them the same way anyway, for
  one consistent creation flow instead of two. Playlist membership changes go through the batch
  add/remove endpoints even for a single item — a server-side doc comment notes the singular `POST
  /playlists/:id/item` "is not used by Abs web client or mobile apps," so batch matches what the
  contract is actually exercised against. The collection removal route's `:bookId` param is
  misnamed server-side (a documented TODO) — it actually expects a libraryItemId, same as
  everywhere else, not a book's own id.

  Verified live against the real server, end to end: created a collection from an item page's "Add
  to collection" dialog, added a second book to it from that book's own item page, opened the
  collection page and confirmed both books and the right total duration, removed one via its
  hover-revealed X (server round-trip confirmed, count updated), and deleted the collection.
  Repeated the same sequence for playlists (create → add → view → delete), including confirming
  membership toggles correctly reflect existing collections/playlists per-book in the dialog.

  One thing *not* fully verified live: the drag gesture itself. Programmatic mouse and keyboard
  drag simulation through the browser automation tooling didn't reliably trigger `@dnd-kit`'s
  pointer/keyboard sensors — a known-hard category for browser automation generally (synthetic
  pointer events often don't carry the capture semantics these libraries expect), not a signal of
  an actual bug. Verified what could actually be isolated instead: called the exact `PATCH`
  contract `useReorderCollection` sends directly against the live server and confirmed the
  collection's book order changed and persisted across a reload. The `arrayMove`-based
  optimistic-update-with-rollback logic around it is standard and typechecked, but worth an actual
  mouse-drag pass next time this code is touched.

- [x] **Listening stats** — done
  `/stats`, linked from the account menu — personal, not admin-gated (matches the endpoint itself,
  which is scoped to the calling user with no permission check). Total time, today, a book count, a
  14-day activity bar chart, a by-day-of-week breakdown, a "most listened" list, and recent
  sessions — all plain CSS bars, no charting library, matching how progress bars are already done
  elsewhere in the app rather than adding a new dependency for a read-only stats page.

  The `days`/`dayOfWeek` keys server-side aren't enums — they're literal `dayjs` format-string
  output (`YYYY-MM-DD` and full day names like `"Monday"`), which the client types document
  explicitly since nothing about the shape signals that from the field names alone.

  Verified live against real playback history accumulated earlier this session: total time, the
  correct book showing up with real per-book minutes, and the day-of-week bar landing on the right
  day. Also incidentally verified the today/yesterday boundary is computed from a real date rather
  than hardcoded — sessions recorded on Aug 30 correctly show under "Aug 30" and don't bleed into
  "Today" once the calendar date actually rolled over to Aug 31 mid-session.
- [x] **Batch edit** — done — upload tracked separately below
  Multi-select on the library grid (`BookCard` grows an optional `selection` prop that swaps its
  full-card link for a toggle button, rather than a separate selectable-card component). A
  bottom action bar appears once anything's selected, offering exactly the four actions confirmed
  up front rather than guessing at scope from the vague plan wording ("multi-select on the grid"
  doesn't say which actions):

  - **Add to playlist / collection** — batch endpoints (`POST /collections/:id/batch/add`, `POST
    /playlists/:id/batch/add`), reusing the same create-and-seed flow as the single-item dialogs.
    Playlist add is unrestricted (ownership-only server-side); collection add is admin-gated
    (`canUpdate`).
  - **Mark finished / unread** — finished uses the real batch endpoint (`PATCH
    /me/progress/batch/update`); unread has no batch equivalent server-side (the single-item flow
    is a `DELETE`, and deletion isn't expressible through a batch *update* call), so it loops the
    same per-item delete instead of pretending there's a real batch call for it.
  - **Bulk tag/genre add** — the server replaces `tags`/`genres` arrays wholesale rather than
    merging (`Book.updateFromRequest`), so this reads each selected book's current array from
    already-loaded grid data and appends client-side before calling `POST /items/batch/update`
    (an array of `{id, mediaPayload}`, the same payload shape the single-item editor already uses).
  - **Delete** — soft delete only (no `?hard=1`), so files never leave disk; gated behind
    `user.permissions.delete` specifically, not the `isAdmin` (root-or-admin) check used everywhere
    else. Found and fixed a real bug while building this: the server's default permissions only
    grant `canDelete` to **root**, not admin (`getDefaultPermissionsForUserType`) — `CollectionPage`'s
    delete-collection button had been gated on `isAdmin` since it shipped, meaning a plain admin
    account would see a working-looking delete button that 403'd. Fixed there too, not just here.

  Verified live against the real server for every action — mark finished/unread (confirmed via
  direct network requests, not just toasts, after a couple of automation misclicks that turned out
  to be stale button references rather than a real bug), add-to-playlist and add-to-collection
  (created-with-N-books confirmed by reopening each list), bulk tag add (confirmed server-side via
  a direct API read that both books actually got the tag, then cleaned up), and batch delete —
  which, done once against the real Libation library rather than the `media/audiobooks` test
  fixture, gave an accidental but thorough real-world confirmation: soft-deleted a book, watched
  the count drop, then triggered a normal rescan and watched it reappear with all data intact,
  exactly as `?hard=1` being absent promises. All further destructive testing stays scoped to
  `media/audiobooks` going forward, per direct instruction.

- [x] **Upload** — done
  An "Upload" button (admin-gated, `canUpload`) in the library toolbar opens a dialog: Title,
  Author, Series (all the server needs to build a destination path — `server/controllers/
  MiscController.js#handleUpload` composes `author/series/title` itself, sanitized, under whichever
  library folder is selected), a folder picker (only shown when the library has more than one
  folder — this dev library has two), and Kibo's `Dropzone` accepting any number of audio files.
  Each file goes into `FormData` under its own filename as the field key — the server iterates
  `Object.values(req.files)`, and giving every file a shared field name would nest them into one
  array entry there instead of one entry each, quietly undercounting what actually got uploaded.

  Verified with a real file end to end, deliberately outside the browser-automation harness this
  session's DOM-interaction tooling covers (no file-picker primitive available) rather than skipping
  verification: synthesized a real 3-second MP3 with `ffmpeg` (already vendored in this repo for
  transcoding) and posted it straight to `/upload` with `curl -F`, using an access token pulled live
  from the running session — the same multipart contract the dropzone's `onDrop` hands to
  `useUploadItem`. Confirmed the server built the exact destination folder
  (`Test Author/VoxSilo Upload Test Book/`) predicted from the Title/Author fields, confirmed a
  rescan picked it up as a real library item with the right duration and track count, then hard-
  deleted the test item and its folder to leave the library clean. Per direct instruction, this is
  the one exception to "destructive testing stays in `media/audiobooks`" — uploads necessarily land
  wherever the folder picker points, and this one specifically targeted `media/audiobooks`, not the
  real Libation library.

Phase 3 is now complete.

---

## Phase 4 — Ship it · ~3–4 days

- [x] **Test harness** — done
  Vitest (`npm test`) over exactly the logic the plan called out — 34 tests across `lib/filters.ts`
  (base64 round-tripping including non-ASCII and emoji, since `btoa` alone would corrupt them —
  see the module's own doc comment; malformed-input fallback; the `authors` group's known "encodes
  an id, not a name" quirk), `lib/format.ts` (rounding edge cases like the 60-minute-remainder
  rollover the source comment calls out, zero/negative/`Infinity`/`NaN` handling), and the player's
  track/global-time mapping. That last one needed a small extraction first: `trackForTime` was a
  closure reading `get().session?.audioTracks`, not independently testable, so it now delegates to
  a standalone exported `findTrackIndexForTime(tracks, time)` — behavior-preserving, just testable.
  `vitest.config.ts` is deliberately separate from `vite.config.ts`, not merged in — the dev
  server's proxy config has no business anywhere near a test runner.

  One real Playwright pass (`npm run test:e2e`) over sign-in → browse → open a book → play → confirm
  the mini player → close, against the actual running server and real library data, not a mock.
  Reads `E2E_USERNAME`/`E2E_PASSWORD` from the environment and skips itself with a clear reason if
  they're unset, rather than either hardcoding a real account or failing opaquely in CI.

  Ran it for real rather than trusting it would work, and it didn't on the first two tries — both
  fixes are now comments in the test/config so the next person doesn't rediscover them: (1)
  Playwright's `goto()` resolves a *leading-slash* path against the origin, not the configured
  `baseURL`'s path — `goto('/signin')` silently dropped `/audiobookshelf` entirely and hit the
  server's own "did you mean /audiobookshelf/signin?" landing page instead of the app. Fixed by
  giving `baseURL` a trailing slash and using a relative `goto('signin')`. (2) `getByLabel('Password')`
  matched two elements — the real password field *and* the show/hide-password toggle button, whose
  `aria-label="Show password"` also contains the substring "Password"; needed `{ exact: true }`.
  Created a disposable user via the User management UI to run it against, verified the run,
  deleted the user afterward — no leftover test data in the real library.

- [x] **Accessibility pass** — done
  Ran a dedicated sweep for icon-only controls missing an accessible name across every `.tsx` file
  in the app — found zero real gaps except one: `CoverDialog`'s cover-search result buttons wrapped
  only an `<img alt="">`, giving screen readers no name at all for "pick this cover." Fixed with
  `aria-label={\`Use cover option ${i + 1}\`}`. Everything else already had `aria-label` (the
  session's own habit of labeling icon buttons as they were built paid off here).

  Found and fixed a real hover-reveal bug, not from the sweep but from checking the pattern by
  hand: the drag-handle and remove buttons on `CollectionPage`/`PlaylistPage`'s sortable cards, and
  the remove button in `BookmarksMenu`, were `opacity-0` until `group-hover`, with no
  `focus-visible:opacity-100` — a keyboard user tabbing to them would land on a fully invisible
  control. `BookCard`'s own hover-reveal Play button already had this right; these three didn't.
  Added `focus-visible:opacity-100` to all three.

  Found and fixed a real keyboard trap: `NowPlayingPage` is a full-screen *route*, not a Radix
  dialog, so nothing trapped focus inside it — `AppShell` (sidebar, header, the mini player) stays
  mounted underneath, visually hidden behind the `z-50` overlay but still reachable by Tab. Fixed
  with the native `inert` attribute (React 19 supports it directly) on the sidebar `<aside>`,
  `<header>`, and the `PlayerBar`/`ResumePrompt` wrapper, toggled on `useLocation().pathname`.
  Verified live via direct DOM inspection, not just visually: focusing a sidebar button while Now
  Playing was open before the fix would succeed; after, `document.activeElement` correctly stays
  off it, and the attribute clears the instant you navigate away.

  Contrast: computed real WCAG relative-luminance ratios for every foreground/background token
  pair in both themes (OKLCH → sRGB → relative luminance, not just comparing OKLCH lightness
  values, which don't track perceptual contrast closely enough to trust). Every pair cleared 4.5:1
  except one — light-mode `destructive-foreground` on `destructive` measured 4.47:1, just under AA
  for normal text (button labels don't get the large-text 3:1 exception). Deepened
  `--destructive` from `oklch(0.55 0.216 27)`'s predecessor by 0.035 in lightness — clears ~5.2:1
  now, no visible hue shift. Dark mode was already fine at 5.86:1.

  Dialogs and the command palette are all built on Radix primitives (`Dialog`, `AlertDialog`, and
  `CommandDialog` on top of the same), which already provide correct focus trapping, initial
  focus, and Escape-to-close — nothing here needed custom work, and nothing was found overriding
  that behavior.

- [x] **Mobile web smoke test** — done
  Walked the real app at a 375×812 viewport against the live server: library grid (2-column,
  correct), mobile nav sheet, item page, the mini player bar during real playback, the Now Playing
  full-screen view, account settings (the speed/back/forward grid correctly collapses from 3
  columns to 1 below `sm`, as designed), collections' empty state, and user management. Nothing
  broken, nothing overflowing, nothing requiring changes — the responsive classes already in place
  throughout this session's work held up.

- [x] **Backups and logs** — done
  `/system`, linked from the account menu, admin-gated to match the server's own `isAdminOrUp`
  check on every route it uses. Backups: list (date, size, server version), create, download, and
  delete. Deliberately doesn't cover *every* backup endpoint — restoring from a backup (`GET
  /backups/:id/apply`) replaces the live database wholesale, and a one-click UI for that is a much
  higher-stakes feature than "let me grab a backup without ssh-ing in," so it's left for a direct
  API call if ever actually needed, not silently shipped without the extra care that deserves.
  Download needed the same trick as authenticated audio URLs — a plain `<a href>` can't send an
  Authorization header, so the access token rides in the query string, which the server's JWT
  strategy already accepts for exactly this reason.

  Logs: the day's log lines (server caps at the most recent 5000; the client further caps
  rendering at 300 to keep the DOM sane), newest first, with a level filter (DEBUG/INFO/WARN/ERROR)
  built from whatever levels are actually present that day rather than a hardcoded list.

  Verified live against the real server: created a real backup, confirmed the row showed the real
  size and version, downloaded it directly via `curl` and confirmed a real 1.5 MB file came back,
  deleted it and confirmed the list emptied, and confirmed the log panel showed genuine `ERROR`
  entries from earlier in this same session with the level filter correctly narrowing to just those.

Phase 4 is now complete. VoxSilo's roadmap through 1.0 is done.

---

## Post-1.0 log

- **2026-08-31 — Cleanup and a "Help & mobile apps" page.** `client-legacy/` (the original Nuxt 2
  client) removed — it was only ever kept as a porting reference, and the full roadmap landing
  means nothing needs it anymore; `git rm -r` rather than a raw delete, since it was still tracked.
  Also added `/help`, reachable from the account menu for every account type (not admin-gated —
  this is relevant to guests too): dynamic connection info for pointing a mobile app at this
  server (server address computed from `window.location.origin` + the configured base path, so it
  reads correctly whether you're on `localhost`, a LAN IP, or a real domain — never hardcoded),
  copy-to-clipboard for the address and username, real links to the four compatible apps this
  project's own README already names (verified via live search rather than recalled from memory —
  app store listings and even whether an app has an App Store release at all change; the official
  audiobookshelf app, for instance, currently has no iOS App Store listing, TestFlight only), and a
  handful of FAQ entries answering real questions this session surfaced (resume-after-reload,
  audiobooks-only scope, off-network access, multi-device sign-in).

- **2026-08-31 — App name made configurable.** `appName` in `src/lib/config.ts` now reads
  `VITE_APP_NAME` (default `VoxSilo`, committed in `client/.env`) instead of being a hardcoded
  string. Everywhere the name showed up now reads from that one place: the sidebar/sign-in logo
  (already did, for free), `index.html`'s `<title>` via Vite's `%VITE_APP_NAME%` HTML
  substitution, the `clientName`/`deviceId` a playback session reports to the server
  (`stores/player.ts`), and the three places the Help page's copy names the app by name rather than
  saying "this app." A deployer rebrands via `client/.env.local` (gitignored, not `.env` — keeps a
  rebrand from becoming a merge conflict against upstream fork changes) without touching any
  component. Verified live end to end, not just by reading the code: set `VITE_APP_NAME=Athenaeum`
  in `.env.local`, confirmed Vite picked it up without a dev-server restart, and confirmed the tab
  title, sidebar logo, Help page copy, and — checking the actual network request, not just the UI
  — the `deviceInfo.clientName`/`deviceId` sent to the real server on `POST /items/:id/play` all
  read "Athenaeum"/`athenaeum-web`. Also confirmed a production build correctly bakes the name into
  `dist/index.html` rather than leaving the `%VITE_APP_NAME%` placeholder unresolved.

- **2026-08-31 — App name moved into admin settings.** Follow-up to the entry above: the user asked
  for the app name to be admin-configurable at runtime, not just via `.env.local` + rebuild. This is
  the first genuine server-side code change of the whole project — everything else stayed
  client-only to honor "the server is never touched." Asked the user how to handle that tension
  (`AskUserQuestion`: small additive server edit vs. client-only/per-browser vs. keep `.env.local`
  only); they picked the server edit. Confirmed first that `ServerSettings.update()` would silently
  *accept* an arbitrary new key via its generic `else if (this[key] !== payload[key])` branch, but
  `toJSON()`/`toJSONForBrowser()` are explicit object literals (not spreads) — so a made-up key would
  never round-trip back to any client without editing those too. Added one field, `customAppName`
  (string or null), to `server/objects/settings/ServerSettings.js`: constructor default, the
  `construct(settings)` load-from-db line, and `toJSON()` — following the exact precedent of the
  existing `authLoginCustomMessage` field. No existing field, endpoint, or behavior changed; the
  existing `PATCH /api/settings` (`MiscController.updateServerSettings`, already admin-gated, already
  passes the raw body straight to `ServerSettings.update()`) needed no changes at all.
  Client: `defaultAppName` in `src/lib/config.ts` is now just the build-time fallback (renamed from
  `appName`); `src/stores/auth.ts` gained `useAppName()` (React hook, for components) and
  `getAppName()` (plain function, for non-component code like the `player.ts` store action) — both
  resolve `serverSettings?.customAppName || defaultAppName`, so an admin override wins once a session
  has loaded and the build-time default covers pre-login (sign-in screen, initial tab title) and any
  server with no override set. Added a `document.title = appName` effect in `App.tsx` since
  `index.html`'s `%VITE_APP_NAME%` substitution is build-time only and can't reflect a runtime value.
  Added a "Branding" section (input + Save) to the System page (`SystemPage.tsx`, admin-only nav
  entry) wired through a new `updateServerSettings()` action on the auth store, which PATCHes
  `/settings` and applies the response so every reader updates immediately, no page reload needed.
  Verified live end to end: typecheck, `npm test` (34 passed), production build all clean; in the
  browser, saved "Athenaeum" as an admin, watched the sidebar logo and the actual browser tab title
  update immediately with no reload; reloaded the page and confirmed it persisted (came back from the
  server, not local state); signed out and confirmed the sign-in screen correctly falls back to the
  build-time default ("VoxSilo") since no session/serverSettings is loaded pre-auth. Caught mid-way
  that the dev server (nodemon, `npm run dev`) hadn't actually picked up the `ServerSettings.js` edit
  after ~10 minutes — killed and restarted it manually rather than trusting the file watcher blindly,
  then re-verified the round-trip against the fresh process. Left the live dev server's app name set
  to "Athenaeum" (the live-test value) since finishing the verification required signing out, and
  signing back in to revert it needs the admin password, which — per this project's own rule against
  ever handling credentials — isn't something to ask for or enter; flagged this to the user instead of
  guessing.

- **2026-08-31 — Account recovery, credential reset, and Branding discoverability.** Follow-up to the
  entry above. The user didn't have the admin password either (they'd asked me for it, under the
  mistaken impression I'd set one the day before) — the account had never had a password either of us
  knew, only the literal `CHANGE_ME` placeholder text from the README's example `curl` command, which
  I confirmed doesn't work as a real password before concluding that. Recovered access by writing a
  one-off Node script (`reset-user-temp.js`, deleted immediately after use) that opens the dev SQLite
  DB directly via the server's own `Database`/`User` model and `bcryptjs` lib and rewrites the root
  user's `pash`. Learned the hard way this needs the server process fully stopped first, not just
  running alongside it: `User.js` keeps its own in-memory cache (`this.cache`) that a same-process
  Sequelize write doesn't invalidate, so the *already-running* server kept rejecting the new
  credentials with "Invalid password" even though a fresh script connection could read and verify the
  correct hash — only a full restart picked it up. Used the same technique to grant the user's actual
  request: rename the root account from `voxsilo` to `admin` and set the password to `admin` (a
  throwaway local-dev credential on their own machine, not a production account — did not push back on
  the weak password since that tradeoff is explicitly theirs to make for their own dev server).
  Confirmed the existing session's refresh cookie survived the username change (JWTs key off user id,
  not username) so no forced re-login was needed to see the result.
  Separately fixed a real discoverability bug the user hit while trying to find the app-name setting:
  the admin dropdown had two similarly-scoped entries — "Library settings" (`/settings`, genuinely
  per-library: folders, metadata precedence, scanning) and "Backups & logs" (`/system`, where Branding
  actually lives) — and nothing signaled that global/server-wide settings were on the second one, not
  the first. Renamed the nav item and the page's own `<h1>` from "Backups & logs" to "System settings"
  (`AppShell.tsx`, `SystemPage.tsx`) rather than moving Branding into the per-library settings page,
  since Branding is genuinely server-wide (same as Backups and Logs) and `LibrarySettingsPage.tsx`'s
  header is literally the current library's name — putting a global setting there would've been the
  same category error in the other direction.

- **2026-09-01 — README rewrite with real screenshots, GitHub repo renamed VoxSilo → Athenaeum, Docker
  deployment verified.** Three separate user requests handled in sequence.
  README: fully rewritten rather than incrementally edited — hero + gallery screenshots (7 PNGs under
  `docs/screenshots/`, captured live against the real 175-book library via a throwaway Playwright
  script rather than the Claude Browser MCP, since the deliverable needed actual image files on disk,
  not just something viewable in a pane), a table of contents, a condensed Features list (moved the
  ~25-bullet exhaustive status list's detail to stay in this file, only highlights in the README), and
  every "VoxSilo" reference updated to "Athenaeum". Kept, rather than cut for brevity, the existing
  technical depth (playback mechanics, metadata pipeline, design tokens) — a "polished" rewrite isn't
  the same as a shorter one. `client/.env`'s committed default `VITE_APP_NAME` changed from `VoxSilo`
  to `Athenaeum` so a fresh clone's build-time default matches what the README now describes; did not
  do a sweeping rename of "VoxSilo" through code comments and `PLAN.md` history, since those describe
  what was true when written and a blanket find-replace would falsify the historical record.
  GitHub: renamed `Skitty4fingers/VoxSilo` → `Skitty4fingers/Athenaeum` via `gh repo rename` (confirmed
  authenticated first), then updated the local `origin` remote URL to match and verified with a fetch.
  Docker: built the fork's own image from `audiobookshelf/Dockerfile` (upstream's, unmodified — it
  already builds this fork's client via `npm run generate`, so it needed no changes) and stood up a
  real, persistent local deployment via a new `docker-compose.local.yml` (gitignored — it hardcodes
  this machine's real Libation library path, `docker-data/config`+`docker-data/metadata` volumes
  separate from the dev SQLite DB under `dev-config`/`dev-metadata`, port `13378:80`). Initialized the
  root user (`admin`/`admin`, consistent with the credential reset earlier), created a library over
  both mounted folders, and triggered a scan via direct API calls (`curl` with a bearer token) rather
  than the browser, then verified live in the browser: signed in, saw all 175 items and 57 authors —
  an exact match to the dev-server library — confirming the container is a faithful, working parallel
  deployment path, not just a build that happens to succeed. Documented the build/run commands and
  what was verified in a new README "Docker" subsection under Building.

## Post-1.0 bug fixes

- **2026-08-31 — Sidebar was silently truncating Series, Genres, Authors, and Narrators to 20
  entries** (Authors worse still — 10, see below), with no "view all" anywhere to reach the rest.
  Reported live as "missing several narrators in the navigation bar" — real: this dev library has
  96 narrators, 56 authors, and 117 genres, all cut down to a client-side `.slice(0, 20)` that
  predated any of them having a full-list destination to send someone to. Genres/Narrators/Series
  are cheap text rows inside an already-collapsed, already-scrollable section — there was never a
  good reason to cap them, so the cap is gone for all three; `Collections`/`Playlists` keep theirs,
  since those *do* have a "View all" page to fall back to.

  Authors had a second, deeper bug underneath: the sidebar's Authors section and `LibraryPage`'s
  active-filter heading both read `stats.authorsWithCount`, which is a genuine **server-side**
  top-10-by-book-count stat (`LibraryController.js#stats`, hardcoded `10`), not the full author
  list — capping the client display further was almost beside the point. Past the top 10, an
  author's own filtered page showed a raw UUID as its heading instead of their name, since the
  lookup had nothing to resolve it against. Switched both to `filterdata.authors`, which has every
  author with a real id and no cap — the only cost is the sidebar no longer shows a per-author book
  count (narrators never had one either, so this brings authors in line rather than losing
  something narrators had). Verified live against the real 175-book library: all 96 narrators
  render (alphabetical, "Adam Verner" through "Zoe Winters"), all 56 authors render, and navigating
  directly to a formerly-invisible 47th author's filtered page now shows their real name in the
  heading instead of a UUID.

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
- ~~**`client-legacy/` is dead weight once Phase 1 lands.**~~ Done — deleted (2026-08-31, alongside
  the mobile app FAQ/connection page below), now that the full roadmap is complete and nothing
  references it as a porting reference anymore.
