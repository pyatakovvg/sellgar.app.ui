import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { NotificationRuntimeInterface } from '../../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationRequest as CoreNotificationRequest } from '../../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationPresentation } from '../../../declaration/notification-presentation';
import { NOTIFICATION_PLACEMENTS, type NotificationPlacement } from '../../../contract/notification-service';
import { NotificationItem } from '../notification-item';

import { groupNotifications } from './notification-groups.ts';

interface IProps {
  readonly notifications: readonly CoreNotificationRequest<React.ReactNode>[];
  readonly presentation: NotificationPresentation;
  readonly runtime: NotificationRuntimeInterface;
}

export const NotificationContainer: React.FC<IProps> = (props) => {
  const groupedNotifications = groupNotifications(props.notifications);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {NOTIFICATION_PLACEMENTS.map((placement) => {
        const notifications = groupedNotifications[placement];

        return notifications.length > 0 ? (
          <View key={placement} pointerEvents="box-none" style={[styles.container, placementStyles[placement]]}>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                presentation={props.presentation}
                runtime={props.runtime}
              />
            ))}
          </View>
        ) : null;
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bottom: {
    bottom: 24,
  },
  center: {
    alignItems: 'center',
  },
  container: {
    elevation: 1000,
    gap: 8,
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    zIndex: 1000,
  },
  left: {
    alignItems: 'flex-start',
  },
  middle: {
    bottom: 0,
    justifyContent: 'center',
    top: 0,
  },
  right: {
    alignItems: 'flex-end',
  },
  top: {
    top: 24,
  },
});

const placementStyles = {
  'bottom-center': [styles.bottom, styles.center],
  'bottom-left': [styles.bottom, styles.left],
  'bottom-right': [styles.bottom, styles.right],
  'middle-left': [styles.middle, styles.left],
  'middle-right': [styles.middle, styles.right],
  'top-center': [styles.top, styles.center],
  'top-left': [styles.top, styles.left],
  'top-right': [styles.top, styles.right],
} satisfies Record<NotificationPlacement, readonly object[]>;
