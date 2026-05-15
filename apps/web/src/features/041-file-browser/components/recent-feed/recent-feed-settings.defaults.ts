/**
 * Recent Changes Feed — single source of truth for setting defaults.
 *
 * Both the SDK contribution (sdk/contribution.ts) AND the runtime orchestrator
 * read these constants. Renaming any KEY breaks v1 user data silently —
 * Constitution Gate locked: see plan § Constitution & Architecture Gate.
 *
 * Plan recent-changes-feed T028.
 */

export const RECENT_FEED_SETTING_KEYS = {
  feedSize: 'fileBrowser.recentFeed.feedSize',
  feedCeiling: 'fileBrowser.recentFeed.feedCeiling',
  defaultFilters: 'fileBrowser.recentFeed.defaultFilters',
  mdExcerptLines: 'fileBrowser.recentFeed.mdExcerptLines',
  mdExcerptChars: 'fileBrowser.recentFeed.mdExcerptChars',
  codeExcerptLines: 'fileBrowser.recentFeed.codeExcerptLines',
  autoplayPolicy: 'fileBrowser.recentFeed.autoplayPolicy',
  deletedWindow: 'fileBrowser.recentFeed.deletedWindow',
  inFlightMediaBound: 'fileBrowser.recentFeed.inFlightMediaBound',
  openOnLaunch: 'fileBrowser.recentFeed.openOnLaunch',
} as const;

export type AutoplayPolicy = 'off' | 'on-hover' | 'on';
export type FilterDefault = readonly (
  | 'all'
  | 'image'
  | 'video'
  | 'audio'
  | 'markdown'
  | 'code'
  | 'other'
)[];

export interface RecentFeedSettings {
  feedSize: number;
  feedCeiling: number;
  defaultFilters: FilterDefault;
  mdExcerptLines: number;
  mdExcerptChars: number;
  codeExcerptLines: number;
  autoplayPolicy: AutoplayPolicy;
  deletedWindow: number;
  inFlightMediaBound: number;
  openOnLaunch: boolean;
}

export const RECENT_FEED_DEFAULTS: RecentFeedSettings = {
  /** Default initial seed size. Workshop §9; covered by AC B2. */
  feedSize: 50,
  /** Hard ceiling on items.length. Workshop §9; covered by AC B2. */
  feedCeiling: 200,
  /** Filter chips active on first render — 'all' = every category. Workshop §9. */
  defaultFilters: ['all'],
  /** Markdown excerpt: cap on non-empty lines. Workshop §9; consumed by truncateMarkdown. */
  mdExcerptLines: 8,
  /** Markdown excerpt: rough char cap. Workshop §9. */
  mdExcerptChars: 600,
  /** Code excerpt: first-N-lines cap. Workshop §9. */
  codeExcerptLines: 12,
  /** Video autoplay policy. Workshop §6 binding: NO autoplay-loop in feed; default 'off'. */
  autoplayPolicy: 'off',
  /** Deleted-card visibility window before auto-removal (ms). Pass Infinity for "Until dismissed". Workshop §9; covered by AC D3. */
  deletedWindow: 5000,
  /** Hard cap on simultaneously-decoded media elements. Covered by AC G2. */
  inFlightMediaBound: 5,
  /** When true, ?view=recent-feed is set automatically on workspace browser landing if no file/dir is already present. Default off. AC A2. */
  openOnLaunch: false,
};
