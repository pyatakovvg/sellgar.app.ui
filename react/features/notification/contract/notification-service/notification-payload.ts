import type React from 'react';

import {
  NOTIFICATION_PLACEMENTS,
  type NotificationHandle,
  type NotificationPlacement,
  type NotificationPayload as CoreNotificationPayload,
} from '../../../../../core/features/notification/contract/notification-service';
import type { NotificationRequest as CoreNotificationRequest } from '../../../../../core/features/notification/runtime/notification-runtime';

export { NOTIFICATION_PLACEMENTS };
export type { NotificationPlacement };

export type NotificationPayload = CoreNotificationPayload<React.ReactNode>;

export interface NotificationRequest extends CoreNotificationRequest<React.ReactNode> {
  readonly placement: NotificationPlacement;
}

export interface NotificationService {
  show(notification: NotificationPayload): NotificationHandle;
}
