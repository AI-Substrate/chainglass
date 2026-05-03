export type FeedItemKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'markdown'
  | 'code'
  | 'binary'
  | 'generic';

export type FeedEventType = 'added' | 'changed' | 'deleted';

export interface FeedItem {
  path: string;
  absolutePath: string;
  name: string;
  changedAt: number;
  size: number;
  kind: FeedItemKind;
  eventType: FeedEventType;
  deletedAt?: number;
}

export interface FeedState {
  items: FeedItem[];
  paused: boolean;
  buffer: FeedItem[];
  ceiling: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isDisconnected: boolean;
  dismissed: Set<string>;
}
