import type React from 'react';

import {
  type NotificationHandle,
  type NotificationPlacement,
  type NotificationPayload as CoreNotificationPayload,
} from '../../../../../core/features/notification/contract/notification-service';
import type { NotificationRequest as CoreNotificationRequest } from '../../../../../core/features/notification/runtime/notification-runtime';

export { NOTIFICATION_PLACEMENTS } from '../../../../../core/features/notification/contract/notification-service';
export type { NotificationPlacement } from '../../../../../core/features/notification/contract/notification-service';

export type NotificationPayload = CoreNotificationPayload<React.ReactNode>;

export interface NotificationRequest extends CoreNotificationRequest<React.ReactNode> {
  readonly placement: NotificationPlacement;
}

export interface NotificationService {
  show(notification: NotificationPayload): NotificationHandle;
}
