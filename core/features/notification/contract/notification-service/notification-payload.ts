export type NotificationStatus = 'destructive' | 'info' | 'success';

export interface NotificationPayload<TContent = unknown> {
  readonly autoClose?: boolean;
  readonly description?: TContent;
  readonly slot?: TContent;
  readonly status?: NotificationStatus;
  readonly timeoutMs?: number;
  readonly title?: TContent;
}

export interface NotificationHandle {
  readonly id: string;

  close(): void;
}
