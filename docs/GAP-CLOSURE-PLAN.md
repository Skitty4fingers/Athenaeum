# Closing the known gaps

**All three lanes below are closed.** This is kept as the record of what each one actually
involved — including where the original plan was wrong — rather than as outstanding work. The
README's [Known gaps](../README.md#known-gaps) now lists what remains true instead.

These were the three items the README used to list. Ordered at the time by effort-to-value: A a
half-day quick win, B the post-1.0 headline feature, C the deepest and splittable into independent
slices. Effort figures assume one person and are rough, matching the conventions in
[PLAN.md](PLAN.md).

---

## A. Vendor bundle — stop shipping lazy-route dependencies upfront (~½ day) — ✅ DONE

**Outcome (measured at the time of this change):** upfront JS went from 820 kB min / 258 kB gzip
(vendor 745.6 + entry 75) to 598 kB min / 187 kB gzip (entry 365.9 + react-core 232.5) — −27%
gzipped. dnd-kit (45 kB), the select machinery (22 kB), dropzone and image-zoom now load with the
routes that use them. (The figure has grown a little since, with the features built in lanes B and
C; PLAN.md's Current state table carries the live number.)
The single biggest win wasn't the chunking at all: the Kibo theme switcher's `motion/react`
import put ~370 kB (rendered) of framer-motion in the entry chunk to animate one three-button
pill, replaced with a CSS transform transition and the `motion` dependency removed entirely.
The 450 kB min working target was reviewed against the treemap and 598 kB is the honest floor
without app restructuring: everything still upfront (Radix used by the shell, TanStack Query,
socket.io-client, sonner, tailwind-merge) is imported by always-mounted code. Verified: hash
stability held (`react-core-Da7l6EHV.js` unchanged across an app-only rebuild), typecheck and
all 34 unit tests pass, and a headless-Chromium pass over the production build confirmed the
entry + react-core + lazy-route loading order with no failed chunk requests.

**Root cause, found in code:** `client/vite.config.ts` uses a blanket rule —

```js
manualChunks(id) {
  if (id.includes('node_modules')) return 'vendor'
}
```

This overrides Rollup's default behavior of assigning a dependency to the chunk that imports
it. The route-level `React.lazy()` split in `App.tsx` is therefore being partially defeated:
`@dnd-kit/*` (only imported by `CollectionPage`/`PlaylistPage`), `react-dropzone` and
`react-medium-image-zoom` (only via Kibo components), and `motion` (only the theme switcher)
are all pulled into the upfront chunk even though nothing on the initial route needs them.
So this is less "diminishing returns" than a small config bug — the returns are sitting there.

**Steps:**

1. **Measure before touching anything.** Add `rollup-plugin-visualizer` as a dev dependency,
   run a build, and record the actual composition of the 745 kB. Keep the treemap output in
   the PR description so the before/after is honest.
2. **Replace the blanket rule with one narrow group.** Keep only a `react-core` manual chunk
   (react, react-dom, react-router-dom, scheduler) so the most stable, most shared code keeps
   its own long-lived cache entry, and let Rollup place everything else with its importer.
   Radix/shadcn primitives are used by the always-mounted shell (sidebar, player bar) and will
   correctly land in the entry chunk on their own.
3. **Audit the two classic bloat sources** while the visualizer is open: `lucide-react` must
   be imported per-icon (it is tree-shakeable, but verify no namespace import slipped in), and
   `date-fns` v4 imports should be per-function.
4. **Guardrail:** leave `build.chunkSizeWarningLimit` at its default so a regression warns in
   the build output, and note the measured upfront-JS number in PLAN.md's Current state table.

**Done when:** upfront JS (entry + react-core + CSS) is measurably smaller — the working
target is under ~450 kB minified, to be confirmed against the visualizer since Radix and
socket.io-client legitimately belong upfront; lazy routes still load (full e2e pass); and a
rebuild that touches only app code leaves the `react-core` chunk hash unchanged.

**Risks:** `manualChunks` is the one Rollup feature that can create circular-init crashes when
it splits too finely — mitigated by grouping only the react core, which has no cross-chunk
init cycles. Watch for request waterfalls if Rollup produces many tiny shared chunks; coarsen
with one more manual group only if measured.

---

## B. Broader Socket.IO live-sync (~2 days for both tiers) — ✅ DONE

**Tier 1 outcome:** shipped as `src/lib/socket-sync.ts`, installed once from `AppShell`. The
event → query-key table is a pure function (`keysForEvent`) with 14 unit tests, and three e2e
tests in `e2e/live-sync.spec.ts` verify it against a real server: a rename made from another
device appears in an open grid without a reload, progress synced from a foreign playback
session flips the item page's action to "Resume", and this tab's own 15s playback heartbeats
cause **zero** grid refetches. That last one was verified by control experiment — with the
own-session guard removed the same test measures 2 refetches per 40 s, so it fails when the
behavior regresses rather than passing vacuously.

Two deviations from the plan below, both found while building:
- `user_updated` carries the full user record, so it is a store patch with *no* query keys —
  `applyUserUpdate` merges it while preserving `accessToken`, which the server's browser-facing
  user JSON deliberately omits.
- The coalescing window runs from the first pending event rather than resetting per event. A
  resetting debounce starves during a scan's burst and never flushes until the burst ends.

**Tier 2 outcome:** collections, playlists, authors (including the scanner's batched
`authors_num_books_updated`) and series added to the same table, plus `user_session_closed`,
which needed real logic rather than an invalidation. Verified live: a collection created, renamed
and deleted from another device tracks on an open list; series and author renames reach their open
pages.

Two decisions worth recording:
- **`stream_reset` is deliberately not subscribed.** It only concerns HLS transcoding, and this
  client plays audio files directly — it never opens an HLS stream, so a handler would be
  unreachable code. Same reasoning as the podcast/RSS events.
- **`user_session_closed` needs to tell our own close from someone else's.** `close()` POSTs to
  `/session/:id/close` and the server echoes the event back to the sender, arriving while
  `close()` is still awaiting its final sync. The player store records ids it is closing and
  consumes them once; a genuinely remote close pauses playback, drops the dead session, and falls
  back to the existing "Continue listening?" prompt rather than leaving audio playing against a
  session that no longer exists and can no longer record position.

### Original plan

**The gap:** the client subscribes to exactly two of the server's ~40 socket events
(`task_started`/`task_finished` for scan status). Everything else — edits from another
browser, progress from the phone app, a household member reordering a shared collection —
waits for a refetch or reload.

**Shape of the fix:** one declarative sync layer, not per-feature hooks. The pattern is
already proven in `use-scan-status.ts`: socket event → TanStack Query invalidation. Generalize
it into `src/lib/socket-sync.ts`, installed once at app root — a table mapping event names to
the query keys they stale. Invalidation is idempotent and cheap at household scale, so the
layer never needs to *interpret* payloads beyond extracting ids; the server stays the source
of truth. Server stays untouched — every event below already exists in `SocketAuthority`.

**Tier 1 — items and progress (~1 day):**

| Event | Invalidates |
| --- | --- |
| `item_updated`, `items_updated`, `item_removed` | `['library-items']`, the item's own query, `['library-series']`, `['library-filterdata']` |
| `user_item_progress_updated` (user-scoped) | progress/continue-listening queries — this is what makes "pause on the phone, resume in the browser" reflect without a reload |
| `library_updated` / `library_added` / `library_removed` | `['libraries']`, library settings |

Guardrail: a scan or batch edit emits `item_updated` in bursts, so coalesce invalidations per
query key with a short trailing debounce (~300 ms) — one refetch per burst, not one per book.

**Tier 2 — shared surfaces (~1 day):**

- `collection_*` and user-scoped `playlist_*` → collections/playlists lists and detail pages.
  Complements drag-to-reorder: two people on the same shared collection stop clobbering each
  other's view.
- `author_updated/added/removed`, `series_updated/added/removed`, `authors_num_books_updated`
  → author and series pages.
- `user_updated` (user-scoped) → refresh the auth store (permissions, settings changed by an
  admin take effect without re-login).
- `user_session_closed` / `stream_reset` → surface a toast in the player rather than silently
  desyncing; decide per-event whether to pause.

**Deliberately not subscribed**, matching the scope cuts in PLAN.md: `episode_*` (podcasts),
`rss_feed_*`, `metadata_embed_queue_update`, `backup_applied`. `admin_message` is a candidate
for a simple toast, but optional.

**Done when:** the event→key map has unit tests (it's a pure table), and a two-browser manual
pass shows: edit metadata in A → B updates; finish a chapter in A → B's progress bar moves;
reorder a collection in A → B reorders. Update PLAN.md line "the other ~28 events aren't
subscribed to" accordingly.

---

## C. Series ordering without the converter (~2–3 days, in independent slices) — ✅ DONE

**C1 + C2 outcome:** `src/lib/series.ts` analyses a series' sequences (pure, 15 unit tests) and
`SeriesPage` shows a banner naming the actual problem — "1 of 2 books has no position", "positions
#1, #2 are used more than once" — which clears once the order is complete. From that banner,
`SeriesOrderDialog` drag-reorders the series and writes sequences 1..N through the existing batch
endpoint. Gated on `permissions.update`, mirroring the server's own check on that route
(`LibraryItemController#batchUpdate`) rather than the looser admin test used elsewhere.

**The thing that made C2 harder than planned, found empirically:** the plan assumed the reorder
could write from the list data already on screen. It cannot. Under `filter=series.<id>` the server
attaches only the *filtered* series to each item, so a book in two series looks like it is in one —
and `updateSeriesFromRequest` replaces a book's series list wholesale. Writing from list data
therefore silently deletes the book's other series memberships; verified against a running server
by doing exactly that and watching a second series disappear. `useReorderSeries` re-reads each
book's full series list from the expanded item endpoint first and changes only the target
sequence. `e2e/series-order.spec.ts` asserts that property directly, so a future refactor that
"optimises away" the extra read fails the suite.

Single-book series are never flagged — one book cannot be out of order with itself, and flagging
them would put a warning on every standalone the scanner filed under a series name.

**C3 outcome:** `libation-to-abs.mjs --watch [--interval=<s>]` keeps converting as Libation
writes new books, so a sidecar becomes a `metadata.json` *before* the scanner reaches the book —
converting after the fact means the first scan already recorded whatever the ID3 tags said.
Polling rather than `fs.watch`, which is unreliable across platforms and network shares (the
common setup for a Libation folder on a NAS); still dependency-free. A pass that throws is logged
and the watch continues, and `--force` is refused with `--watch` because it would rewrite every
book on a timer.

The upload half turned out to be a real gap, confirmed against a running server: `POST /upload`
uses `series` only as a folder-path component and stores no position, so an uploaded book landed
in its series with `sequence: null` and sorted arbitrarily. The upload dialog now takes an
optional position, and the hook waits for the watcher's scan, finds the item and PATCHes the
sequence on. If the scan outruns the wait the upload still stands and the toast says the position
was not set, pointing at the series editor — rather than silently dropping the number.

Both write paths that touch a sequence now share `withSequenceForSeries`, so the
replace-the-list-wholesale hazard lives in one unit-tested place.

### Original plan

**The gap:** correct series order depends on `scripts/libation-to-abs.mjs` having produced a
`metadata.json`; books that arrive any other way (in-app upload, manual copy) fall back to
ID3 `SERIES`/`PART` tags, which are wrong or missing for parts of a set.

The API-contract constraint (PLAN.md: never touch `/api`, server edits confined to static
serving) rules out hooking the scanner. So close it from three directions that are all
client-side or tooling-side:

**C1. Detect — a series-health flag (~½ day).** `SeriesPage` already loads every book with its
sequence. When any book in the series has a missing or duplicate sequence, show a banner:
"N books in this series have no order." Zero new data fetching; it just makes the silent
failure visible where the user is already looking at it.

**C2. Fix in-app — a series order editor (~1–1.5 days).** From that banner, open a
drag-to-reorder dialog for the series (the dnd-kit pattern is already built for collections
and playlists) that assigns sequences 1..N and writes them through the existing batch update
endpoint (`POST /api/items/batch/update`, already used by bulk tag/genre edits, already
emitting `items_updated` — which Tier 1 of lane B turns into an instant refresh). This is the
structural fix: it repairs ordering for *any* source of books, not just Libation output, and
the item editor precedent (series matched by name, verified in PLAN.md) shows the server
handles the write correctly.

**C3. Prevent — converter and upload ergonomics (~½ day).**
- Add `--watch` to `libation-to-abs.mjs` (poll `fs.stat` on an interval; the script is
  dependency-free and should stay that way), so a Libation download folder gets its
  `metadata.json` written before the next scan picks the book up. Document running it as a
  service/cron next to the Docker deployment notes.
- The in-app upload form already collects series; verify whether sequence survives to the
  scanned item, and if not, have the upload flow PATCH series+sequence onto the item after
  the scan completes — the client knows exactly what the user typed, and the write path is
  the same one the item editor already uses.

**Done when:** a book added with no `metadata.json` can be put in correct series order
entirely from the UI; the health banner appears/disappears correctly (unit-test the
missing/duplicate-sequence predicate); `--watch` round-trips a new sidecar in a manual test.

---

## Suggested sequencing

1. **A** first — half a day, self-contained, and every later PR ships less JavaScript.
2. **B Tier 1** next — the sync layer is the biggest daily-use win and C2 lands nicer on top
   of it (batch sequence writes propagate to other tabs for free).
3. **C1 → C2**, then **B Tier 2** and **C3** in either order.

Each lane is a separate PR against `main` with its own verification; nothing here touches
`server/` or the API contract.
