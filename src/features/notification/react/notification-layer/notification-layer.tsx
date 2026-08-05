import React from 'react';
import ReactDOM from 'react-dom';

import { useDependency } from '../../../../runtime/react';
import { NOTIFICATION_PLACEMENTS, type NotificationPlacement } from '../../contract/notification-service';
import { NotificationPresentation } from '../../declaration/notification-presentation';
import { NotificationRuntimeInterface, type NotificationRequest } from '../../runtime/notification-runtime';

import s from './default.module.scss';

interface NotificationLayerProps {
  readonly presentation: NotificationPresentation;
}

export const NotificationLayer: React.FC<NotificationLayerProps> = ({ presentation }) => {
  const runtime = useDependency(NotificationRuntimeInterface);
  const [portal, setPortal] = React.useState<Element | null>(null);
  const notifications = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    () => [],
  );

  React.useEffect(() => {
    const notificationContainer = document.querySelector('#notification') ?? document.createElement('div');

    if (!notificationContainer.id) {
      notificationContainer.setAttribute('id', 'notification');
    }

    notificationContainer.setAttribute('class', s.portal);
    notificationContainer.setAttribute('data-floating-ui-ignore-outside-press', '');

    if (notificationContainer.parentElement !== document.body) {
      document.body.appendChild(notificationContainer);
    }

    setPortal(notificationContainer);
  }, []);

  if (!portal) {
    return null;
  }

  return ReactDOM.createPortal(
    <NotificationContainer notifications={notifications} presentation={presentation} runtime={runtime} />,
    portal,
    'notification',
  );
};

interface NotificationContainerProps {
  readonly notifications: readonly NotificationRequest[];
  readonly presentation: NotificationPresentation;
  readonly runtime: NotificationRuntimeInterface;
}

const NotificationContainer: React.FC<NotificationContainerProps> = ({ notifications, presentation, runtime }) => {
  const groupedNotifications = NOTIFICATION_PLACEMENTS.reduce<Record<NotificationPlacement, NotificationRequest[]>>(
    (acc, placement) => {
      acc[placement] = [];

      return acc;
    },
    {} as Record<NotificationPlacement, NotificationRequest[]>,
  );

  for (const notification of notifications) {
    groupedNotifications[notification.placement].push(notification);
  }

  return (
    <div className={s.root}>
      {NOTIFICATION_PLACEMENTS.map((placement) => {
        const placementNotifications = groupedNotifications[placement];

        if (placementNotifications.length === 0) {
          return null;
        }

        return (
          <div className={[s.container, s[placement]].join(' ')} key={placement} onClick={stopPropagation}>
            {placementNotifications.map((notification) => {
              const View = presentation.resolve(notification.status);

              return (
                <div
                  className={s.notification}
                  key={notification.id}
                  onBlur={(event) => handleNotificationBlur(event, runtime, notification.id)}
                  onFocus={() => runtime.pauseAutoClose(notification.id)}
                  onMouseEnter={() => runtime.pauseAutoClose(notification.id)}
                  onMouseLeave={() => runtime.resumeAutoClose(notification.id)}
                >
                  <View notification={notification} close={() => runtime.close(notification.id)} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const handleNotificationBlur = (
  event: React.FocusEvent<HTMLDivElement>,
  runtime: NotificationRuntimeInterface,
  notificationId: string,
): void => {
  const nextTarget = event.relatedTarget;

  if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
    return;
  }

  runtime.resumeAutoClose(notificationId);
};

const stopPropagation = (event: React.MouseEvent<HTMLDivElement>): void => {
  event.stopPropagation();
};
