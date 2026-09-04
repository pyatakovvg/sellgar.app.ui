import React from 'react';

import type { NotificationRuntimeInterface } from '../../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationRequest as CoreNotificationRequest } from '../../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationPresentation } from '../../../declaration/notification-presentation';
import {
  NOTIFICATION_PLACEMENTS,
  type NotificationPlacement,
  type NotificationRequest,
} from '../../../contract/notification-service';
import { NotificationItem } from '../notification-item';

import { resolveNotificationPlacement } from './notification-placement.resolver.ts';

import cn from 'classnames';
import s from './default.module.scss';

interface IProps {
  readonly notifications: readonly CoreNotificationRequest<React.ReactNode>[];
  readonly presentation: NotificationPresentation;
  readonly runtime: NotificationRuntimeInterface;
}

export const NotificationContainer: React.FC<IProps> = (props) => {
  const groupedNotifications = groupNotifications(props.notifications);

  return (
    <div className={s.wrapper}>
      {NOTIFICATION_PLACEMENTS.map((placement) => {
        const notifications = groupedNotifications[placement];

        return notifications.length > 0 ? (
          <div className={cn(s.container, s[placement])} key={placement} onClick={(event) => event.stopPropagation()}>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                presentation={props.presentation}
                runtime={props.runtime}
              />
            ))}
          </div>
        ) : null;
      })}
    </div>
  );
};

const groupNotifications = (
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
