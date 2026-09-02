/**
 * Types for the audiobookshelf API surface this client consumes.
 *
 * These mirror the server's `toOldJSON*` serialisers rather than its Sequelize
 * models — that is the shape actually sent over the wire. Fields are typed as
 * they arrive, including the `| null`s the server really emits, so components
 * are forced to handle sparse metadata (which is the common case for scanned
 * libraries).
 */

export type MediaType = 'book' | 'podcast'

export interface BookSeriesRef {
  id: string
  name: string
  sequence: string | null
}

export interface BookMetadataMinified {
  title: string | null
  titleIgnorePrefix: string | null
  subtitle: string | null
  authorName: string
  authorNameLF: string
  narratorName: string
  seriesName: string
  /**
   * Present only when the server attaches series context (a `series.*` filter
   * or `collapseseries=1`). Plain listings carry `seriesName` alone.
   */
  series?: BookSeriesRef | BookSeriesRef[]
  /** Present only on the expanded item response — plain listings carry `authorName` alone. */
  authors?: { id: string; name: string }[]
  genres: string[]
  publishedYear: string | null
  publishedDate: string | null
  publisher: string | null
  description: string | null
  isbn: string | null
  asin: string | null
  language: string | null
  explicit: boolean
  abridged: boolean
}

export interface PodcastMetadataMinified {
  title: string | null
  titleIgnorePrefix: string | null
  author: string | null
  description: string | null
  releaseDate: string | null
  genres: string[]
  language: string | null
  explicit: boolean
}

export interface BookMediaMinified {
  id: string
  metadata: BookMetadataMinified
  coverPath: string | null
  tags: string[]
  numTracks: number
  numAudioFiles: number
  numChapters: number
  duration: number
  size: number
  ebookFormat?: string
}

export interface PodcastMediaMinified {
  id: string
  metadata: PodcastMetadataMinified
  coverPath: string | null
  tags: string[]
  numEpisodes?: number
  size: number
}

export interface LibraryItemMinified {
  id: string
  ino: string
  oldLibraryItemId: string | null
  libraryId: string
  folderId: string
  path: string
  relPath: string
  isFile: boolean
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  addedAt: number
  updatedAt: number
  isMissing: boolean
  isInvalid: boolean
  mediaType: MediaType
  media: BookMediaMinified | PodcastMediaMinified
  numFiles: number
  size: number
  collapsedSeries?: {
    id: string
    name: string
    nameIgnorePrefix?: string
    sequence: string | null
    numBooks: number
    libraryItemIds: string[]
  }
  numEpisodesIncomplete?: number
}

export interface LibrarySettings {
  coverAspectRatio: number
  disableWatcher: boolean
  autoScanCronExpression: string | null
  skipMatchingMediaWithAsin: boolean
  skipMatchingMediaWithIsbn: boolean
  audiobooksOnly: boolean
  epubsAllowScriptedContent: boolean
  hideSingleBookSeries: boolean
  onlyShowLaterBooksInContinueSeries: boolean
  metadataPrecedence: string[]
  markAsFinishedPercentComplete: number | null
  markAsFinishedTimeRemaining: number | null
}

export interface Library {
  id: string
  name: string
  folders: { id: string; fullPath: string }[]
  displayOrder: number
  icon: string
  mediaType: MediaType
  provider: string
  settings: LibrarySettings
  lastScan: number | null
  lastScanVersion: string | null
  createdAt: number
  lastUpdate: number
}

export interface MediaProgress {
  id: string
  libraryItemId: string
  episodeId: string | null
  duration: number
  progress: number
  currentTime: number
  isFinished: boolean
  hideFromContinueListening: boolean
  lastUpdate: number
  startedAt: number
  finishedAt: number | null
}

export interface AudioBookmark {
  libraryItemId: string
  time: number
  title: string
  createdAt: number
}

export interface UserPermissions {
  download: boolean
  update: boolean
  delete: boolean
  upload: boolean
  accessAllLibraries: boolean
  accessAllTags: boolean
  accessExplicitContent: boolean
  librariesAccessible: string[]
  itemTagsSelected: string[]
}

export interface User {
  id: string
  username: string
  email: string | null
  type: 'root' | 'admin' | 'user' | 'guest'
  token?: string
  accessToken?: string
  refreshToken?: string | null
  mediaProgress: MediaProgress[]
  seriesHideFromContinueListening: string[]
  bookmarks: unknown[]
  isActive: boolean
  isLocked: boolean
  lastSeen: number | null
  createdAt: number
  permissions: UserPermissions
  librariesAccessible: string[]
  itemTagsSelected: string[]
}

export interface ServerSettings {
  id: string
  dateFormat: string
  timeFormat: string
  language: string
  version: string
  /** Admin-configurable app display name; null/unset falls back to the client's build-time default. */
  customAppName: string | null
  [key: string]: unknown
}

/** Response body shared by POST /login and POST /auth/refresh. */
export interface LoginResponse {
  user: User
  userDefaultLibraryId: string | null
  serverSettings: ServerSettings
  ereaderDevices: unknown[]
  Source: string
}

/** GET /status — served unauthenticated, used to detect an uninitialised server. */
export interface ServerStatus {
  app: string
  serverVersion: string
  isInit: boolean
  language: string
  authMethods: string[]
  authFormData: Record<string, unknown>
}

/** GET /api/authors/:id?include=items */
export interface AuthorDetail {
  id: string
  asin: string | null
  name: string
  description: string | null
  imagePath: string | null
  libraryId: string
  addedAt: number
  updatedAt: number
  libraryItems: LibraryItemMinified[]
}

/**
 * `server/models/Collection.js`. Shared, library-wide shelves — creating or
 * modifying membership requires `canUpdate` (admin/root by default), unlike
 * playlists which are owned per-user with no permission gate.
 */
export interface Collection {
  id: string
  libraryId: string
  name: string
  description: string | null
  books: LibraryItemMinified[]
  lastUpdate: number
  createdAt: number
}

/**
 * `server/models/Playlist.js`. Personal — `userId` owns it, and the server
 * enforces that only the owner can read or modify their own playlist.
 */
export interface Playlist {
  id: string
  name: string
  libraryId: string
  userId: string
  description: string | null
  items: { libraryItemId: string; libraryItem: LibraryItemMinified }[]
  lastUpdate: number
  createdAt: number
}

/** One entry in `ListeningStats.recentSessions` — `server/objects/PlaybackSession.js#toOldJSON`. */
export interface ListeningSessionSummary {
  id: string
  libraryItemId: string
  displayTitle: string
  displayAuthor: string
  coverPath: string | null
  duration: number
  timeListening: number
  date: string
  dayOfWeek: string
  startedAt: number
  updatedAt: number
}

/**
 * GET /api/me/listening-stats (`server/routers/ApiRouter.js#getUserListeningStatsHelpers`).
 * `days` and `dayOfWeek` are keyed by `YYYY-MM-DD` and full day names ("Monday", ...) respectively —
 * both come straight from a `dayjs` format call server-side, not enum values.
 */
export interface ListeningStats {
  totalTime: number
  items: Record<string, { id: string; timeListening: number; mediaMetadata: { title?: string; authorName?: string } | null }>
  days: Record<string, number>
  dayOfWeek: Record<string, number>
  today: number
  recentSessions: ListeningSessionSummary[]
}

/** GET /api/libraries/:id/items */
export interface LibraryItemsPage {
  results: LibraryItemMinified[]
  total: number
  limit: number
  page: number
  sortBy?: string
  sortDesc: boolean
  filterBy?: string
  minified: boolean
  collapseseries: boolean
  offset: number
}

/** GET /api/libraries/:id/filterdata */
export interface LibraryFilterData {
  authors: { id: string; name: string }[]
  genres: string[]
  tags: string[]
  series: { id: string; name: string }[]
  narrators: string[]
  languages: string[]
  publishers: string[]
  publishedDecades: string[]
  numIssues: number
}

/** GET /api/libraries/:id/stats */
export interface LibraryStats {
  totalItems: number
  totalAuthors: number
  totalGenres: number
  totalSize: number
  totalDuration: number
  numAudioTracks: number
  genresWithCount: { genre: string; count: number }[]
  authorsWithCount: { id: string; name: string; count: number }[]
  longestItems: { id: string; title: string; duration: number }[]
  largestItems: { id: string; title: string; size: number }[]
}

/** GET /api/me/items-in-progress */
export interface ItemInProgress extends LibraryItemMinified {
  progressLastUpdate: number
}

/** GET /api/libraries/:id/series */
export interface LibrarySeries {
  id: string
  name: string
  nameIgnorePrefix: string
  description: string | null
  addedAt: number
  updatedAt: number
  libraryId: string
  books?: LibraryItemMinified[]
  /** Present when `include=progress`; otherwise derive from the books. */
  totalDuration?: number
}

/**
 * `?expanded=1` metadata — a superset of BookMetadataMinified with the
 * structured author/narrator/series fields the editable form needs, rather
 * than the flattened `authorName`/`narratorName`/`seriesName` display
 * strings. See server/models/Book.js `oldMetadataToJSONExpanded`.
 */
export interface BookMetadataExpanded {
  title: string | null
  subtitle: string | null
  authors: { id: string; name: string }[]
  authorName: string
  authorNameLF: string
  narrators: string[]
  narratorName: string
  series: BookSeriesRef[]
  seriesName: string
  genres: string[]
  publishedYear: string | null
  publishedDate: string | null
  publisher: string | null
  description: string | null
  descriptionPlain?: string
  isbn: string | null
  asin: string | null
  language: string | null
  explicit: boolean
  abridged: boolean
}

export interface BookMediaExpanded {
  id: string
  metadata: BookMetadataExpanded
  coverPath: string | null
  tags: string[]
  numTracks: number
  numAudioFiles: number
  numChapters: number
  duration: number
  size: number
  ebookFormat?: string
}

/** `server/objects/Backup.js#toJSON`. */
export interface Backup {
  id: string
  key: string
  backupDirPath: string
  datePretty: string
  fullPath: string
  path: string
  filename: string
  fileSize: number
  createdAt: number
  serverVersion: string
}

/** `server/managers/LogManager.js` — the `LogObject` typedef. */
export interface LogEntry {
  timestamp: string
  source: string
  message: string
  levelName: string
  level: number
}


/**
 * Admin telemetry shapes.
 *
 * All of this is data the server already keeps and already exposes to admins —
 * `GET /api/users/online`, `GET /api/sessions` — plus the `user_online` /
 * `user_offline` / `user_stream_update` socket events, which `SocketAuthority`
 * emits with `adminEmitter` so they never reach a non-admin client.
 */

/** The device that opened a playback session (`PlaybackSession#deviceInfo`). */
export interface SessionDeviceInfo {
  id?: string
  userId?: string
  deviceId?: string
  ipAddress?: string | null
  clientName?: string | null
  clientVersion?: string | null
  osName?: string | null
  osVersion?: string | null
  browserName?: string | null
}

/** An in-flight playback session, as the admin endpoints report it. */
export interface OpenPlaybackSession {
  id: string
  userId: string
  libraryItemId: string
  displayTitle: string | null
  displayAuthor: string | null
  coverPath: string | null
  /** Position within the book, in seconds. */
  currentTime: number
  duration: number
  /** Seconds actually listened during this session — not the same as position. */
  timeListening: number
  mediaPlayer: string | null
  playMethod: number | null
  deviceInfo: SessionDeviceInfo | null
  startedAt: number
  updatedAt: number
}

/** A user with at least one live socket connection (`User#toJSONForPublic`). */
export interface OnlineUser {
  id: string
  username: string
  type: string
  /** Open socket connections for this user — browser tabs, not playback streams. */
  connections: number
  lastSeen: number | null
  createdAt: number
  /** The first open playback session for this user, if any. */
  session: OpenPlaybackSession | null
}

export interface OnlineUsersResponse {
  usersOnline: OnlineUser[]
  openSessions: OpenPlaybackSession[]
}

/** A historical session row from `GET /api/sessions` (admin), which joins the user. */
export interface SessionWithUser extends OpenPlaybackSession {
  user: { id: string; username: string } | null
}

export interface SessionsPage {
  total: number
  numPages: number
  page: number
  itemsPerPage: number
  sessions: SessionWithUser[]
}
