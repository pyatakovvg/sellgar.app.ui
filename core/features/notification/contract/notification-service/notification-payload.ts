export const NOTIFICATION_PLACEMENTS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type NotificationPlacement = (typeof NOTIFICATION_PLACEMENTS)[number];

export type NotificationStatus = 'destructive' | 'info' | 'success';

export interface NotificationPayload<TContent = unknown> {
  readonly autoClose?: boolean;
  readonly description?: TContent;
  readonly placement?: NotificationPlacement;
  readonly slot?: TContent;
  readonly status?: NotificationStatus;
  readonly timeoutMs?: number;
  readonly title?: TContent;
}

export interface NotificationHandle {
  readonly id: string;

  close(): void;
}
