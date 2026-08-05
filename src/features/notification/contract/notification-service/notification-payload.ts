import type React from 'react';

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

export interface NotificationPayload {
  readonly autoClose?: boolean;
  readonly description?: React.ReactNode;
  readonly placement?: NotificationPlacement;
  readonly slot?: React.ReactNode;
  readonly status?: NotificationStatus;
  readonly timeoutMs?: number;
  readonly title?: React.ReactNode;
}

export interface NotificationHandle {
  readonly id: string;

  close(): void;
}
