import type React from 'react';

import type {
  NotificationHandle,
  NotificationPayload as CoreNotificationPayload,
} from '../../../../../core/features/notification/contract/notification-service';
import type { NotificationRequest as CoreNotificationRequest } from '../../../../../core/features/notification/runtime/notification-runtime';

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

export interface NotificationPayload extends CoreNotificationPayload<React.ReactNode> {
  readonly placement?: NotificationPlacement;
}

export interface NotificationRequest extends CoreNotificationRequest<React.ReactNode> {
  readonly placement: NotificationPlacement;
}

export interface NotificationService {
  show(notification: NotificationPayload): NotificationHandle;
}
