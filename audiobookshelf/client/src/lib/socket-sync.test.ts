import { describe, expect, it } from 'vitest'
import { keysForEvent, SYNCED_EVENTS } from './socket-sync'

/** Query keys are order-independent; compare as sets of serialized keys. */
function keySet(event: string, payload: unknown) {
  return new Set(keysForEvent(event, payload).map((k) => JSON.stringify(k)))
}

function has(event: string, payload: unknown, key: readonly unknown[]) {
  return keySet(event, payload).has(JSON.stringify(key))
}

describe('keysForEvent', () => {
  it('ignores events outside the subscribed set', () => {
    // Podcast/RSS events are deliberately unhandled — see the module doc.
    expect(keysForEvent('episode_added', { id: 'e1' })).toEqual([])
    expect(keysForEvent('rss_feed_open', {})).toEqual([])
    expect(keysForEvent('nonsense', {})).toEqual([])
  })

  describe('item events', () => {
    const item = { id: 'li_1', libraryId: 'lib_1' }

    it('stales the grid, the item itself, and library-derived data', () => {
      expect(has('item_updated', item, ['library-items'])).toBe(true)
      expect(has('item_updated', item, ['item', 'li_1'])).toBe(true)
      expect(has('item_updated', item, ['items-in-progress'])).toBe(true)
      expect(has('item_updated', item, ['library-series', 'lib_1'])).toBe(true)
      expect(has('item_updated', item, ['library-filterdata', 'lib_1'])).toBe(true)
      expect(has('item_updated', item, ['library-stats', 'lib_1'])).toBe(true)
    })

    it('treats added and removed the same as updated', () => {
      for (const event of ['item_added', 'item_removed']) {
        expect(has(event, item, ['item', 'li_1'])).toBe(true)
        expect(has(event, item, ['library-items'])).toBe(true)
      }
    })

    it('handles the array payload of a batch event', () => {
      const payload = [
        { id: 'li_1', libraryId: 'lib_1' },
        { id: 'li_2', libraryId: 'lib_1' },
        { id: 'li_3', libraryId: 'lib_2' }
      ]
      const keys = keySet('items_updated', payload)
      expect(keys.has(JSON.stringify(['item', 'li_1']))).toBe(true)
      expect(keys.has(JSON.stringify(['item', 'li_3']))).toBe(true)
      // Both libraries' derived data, each exactly once.
      expect(keys.has(JSON.stringify(['library-series', 'lib_1']))).toBe(true)
      expect(keys.has(JSON.stringify(['library-series', 'lib_2']))).toBe(true)
    })

    it('falls back to prefix keys when the payload has no libraryId', () => {
      // Over-refetching is the correct failure mode; silently skipping is not.
      expect(has('item_updated', { id: 'li_1' }, ['library-series'])).toBe(true)
      expect(has('item_updated', { id: 'li_1' }, ['library-filterdata'])).toBe(true)
    })

    it('survives malformed payloads without throwing', () => {
      for (const payload of [null, undefined, {}, [], 'nope', 42, { id: 7 }]) {
        expect(() => keysForEvent('item_updated', payload)).not.toThrow()
      }
      // A payload with no usable id still refreshes the grid.
      expect(has('item_updated', {}, ['library-items'])).toBe(true)
      expect(has('item_updated', { id: 7 }, ['item', 7])).toBe(false)
    })
  })

  describe('library events', () => {
    it('stales the library list', () => {
      expect(has('library_updated', { id: 'lib_1' }, ['libraries'])).toBe(true)
      expect(has('library_added', { id: 'lib_1' }, ['libraries'])).toBe(true)
      expect(has('library_removed', { id: 'lib_1' }, ['libraries'])).toBe(true)
    })

    it('scopes derived data to the affected library', () => {
      expect(has('library_updated', { id: 'lib_1' }, ['library-filterdata', 'lib_1'])).toBe(true)
    })
  })

  describe('task_finished', () => {
    const scan = { action: 'library-scan', data: { libraryId: 'lib_1' } }

    it('refreshes everything a scan can change', () => {
      expect(has('task_finished', scan, ['library-items'])).toBe(true)
      expect(has('task_finished', scan, ['libraries'])).toBe(true)
      expect(has('task_finished', scan, ['library-series', 'lib_1'])).toBe(true)
      expect(has('task_finished', scan, ['library-stats', 'lib_1'])).toBe(true)
    })

    it('still refreshes broadly when the task names no library', () => {
      expect(has('task_finished', { action: 'other' }, ['library-series'])).toBe(true)
    })
  })

  describe('user_item_progress_updated', () => {
    const payload = {
      id: 'mp_1',
      sessionId: 'sess_1',
      data: { libraryItemId: 'li_1', currentTime: 120, progress: 0.4 }
    }

    it('stales progress-bearing queries and the played item', () => {
      expect(has('user_item_progress_updated', payload, ['items-in-progress'])).toBe(true)
      expect(has('user_item_progress_updated', payload, ['library-items'])).toBe(true)
      expect(has('user_item_progress_updated', payload, ['item', 'li_1'])).toBe(true)
    })

    it('omits the item key when the payload carries no item id', () => {
      const keys = keySet('user_item_progress_updated', { sessionId: 'sess_1', data: {} })
      expect([...keys].some((k) => k.startsWith('["item"'))).toBe(false)
      expect(keys.has(JSON.stringify(['items-in-progress']))).toBe(true)
    })
  })

  describe('collections and playlists', () => {
    it('stales the list and the affected collection', () => {
      for (const event of ['collection_added', 'collection_updated', 'collection_removed']) {
        expect(has(event, { id: 'col_1' }, ['collections'])).toBe(true)
        expect(has(event, { id: 'col_1' }, ['collection', 'col_1'])).toBe(true)
      }
    })

    it('stales the list and the affected playlist', () => {
      for (const event of ['playlist_added', 'playlist_updated', 'playlist_removed']) {
        expect(has(event, { id: 'pl_1' }, ['playlists'])).toBe(true)
        expect(has(event, { id: 'pl_1' }, ['playlist', 'pl_1'])).toBe(true)
      }
    })

    it('still stales the list when the payload carries no id', () => {
      expect(has('collection_updated', {}, ['collections'])).toBe(true)
      expect([...keySet('collection_updated', {})].some((k) => k.startsWith('["collection"'))).toBe(false)
    })
  })

  describe('authors', () => {
    it('stales the author page and the sidebar author list', () => {
      for (const event of ['author_added', 'author_updated', 'author_removed']) {
        expect(has(event, { id: 'au_1' }, ['author', 'au_1'])).toBe(true)
        expect(has(event, { id: 'au_1' }, ['library-filterdata'])).toBe(true)
      }
    })

    it('handles the scanner’s batched book-count payload', () => {
      // `{ libraryId, authors: [{ id, numBooks }] }` — see BookScanner#emitAuthorsNumBooksUpdated.
      const payload = { libraryId: 'lib_1', authors: [{ id: 'au_1', numBooks: 3 }, { id: 'au_2', numBooks: 5 }] }
      expect(has('authors_num_books_updated', payload, ['author', 'au_1'])).toBe(true)
      expect(has('authors_num_books_updated', payload, ['author', 'au_2'])).toBe(true)
      expect(has('authors_num_books_updated', payload, ['library-filterdata'])).toBe(true)
    })

    it('survives a batched payload with no authors', () => {
      expect(() => keysForEvent('authors_num_books_updated', { libraryId: 'lib_1' })).not.toThrow()
      expect(has('authors_num_books_updated', { libraryId: 'lib_1' }, ['library-filterdata'])).toBe(true)
    })
  })

  describe('series', () => {
    it('stales the series list and any open series page', () => {
      for (const event of ['series_added', 'series_updated', 'series_removed']) {
        expect(has(event, { id: 'se_1', libraryId: 'lib_1' }, ['library-series'])).toBe(true)
        expect(has(event, { id: 'se_1', libraryId: 'lib_1' }, ['series-books'])).toBe(true)
      }
    })
  })

  it('maps user_session_closed to no queries — the player store handles it', () => {
    // Payload is the bare session id string, not an object.
    expect(keysForEvent('user_session_closed', 'sess_1')).toEqual([])
  })

  it('does not subscribe to HLS stream_reset — this client never opens an HLS stream', () => {
    expect(SYNCED_EVENTS).not.toContain('stream_reset')
    expect(keysForEvent('stream_reset', { streamId: 's1', startTime: 12 })).toEqual([])
  })

  it('maps user_updated to no queries — it is a store-only patch', () => {
    expect(keysForEvent('user_updated', { id: 'u_1' })).toEqual([])
  })

  it('returns at least one key for every subscribed event that is not store-only', () => {
    const storeOnly = new Set(['user_updated', 'user_session_closed'])
    for (const event of SYNCED_EVENTS) {
      if (storeOnly.has(event)) continue
      const payload =
        event === 'task_finished'
          ? { data: { libraryId: 'lib_1' } }
          : event === 'user_item_progress_updated'
            ? { data: { libraryItemId: 'li_1' } }
            : event === 'authors_num_books_updated'
              ? { libraryId: 'lib_1', authors: [{ id: 'au_1', numBooks: 2 }] }
              : { id: 'x', libraryId: 'lib_1' }
      expect(keysForEvent(event, payload).length, `${event} produced no keys`).toBeGreaterThan(0)
    }
  })
})
