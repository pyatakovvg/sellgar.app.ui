import type React from 'react';

import type { NotificationRequest as CoreNotificationRequest } from '../../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationPlacement, NotificationRequest } from '../../../contract/notification-service';

import { resolveNotificationPlacement } from './notification-placement.resolver.ts';

export const groupNotifications = (
  notifications: readonly CoreNotificationRequest<React.ReactNode>[],
): Record<NotificationPlacement, NotificationRequest[]> => {
  const groups: Record<NotificationPlacement, NotificationRequest[]> = {
    'bottom-center': [],
    'bottom-left': [],
    'bottom-right': [],
    'middle-left': [],
    'middle-right': [],
    'top-center': [],
    'top-left': [],
    'top-right': [],
  };

  for (const notification of notifications) {
    const placement = resolveNotificationPlacement(notification);

    groups[placement].push({
      ...notification,
      placement,
    });
  }

  return groups;
};
