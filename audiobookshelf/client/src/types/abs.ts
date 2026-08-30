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

export interface Library {
  id: string
  name: string
  folders: { id: string; fullPath: string }[]
  displayOrder: number
  icon: string
  mediaType: MediaType
  provider: string
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
