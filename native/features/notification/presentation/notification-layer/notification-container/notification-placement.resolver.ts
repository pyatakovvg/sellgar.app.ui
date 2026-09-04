import { NOTIFICATION_PLACEMENTS, type NotificationPlacement } from '../../../contract/notification-service';

const DEFAULT_NOTIFICATION_PLACEMENT: NotificationPlacement = 'bottom-right';

export const resolveNotificationPlacement = (notification: object): NotificationPlacement => {
  const placement: unknown = Reflect.get(notification, 'placement');

  return isNotificationPlacement(placement) ? placement : DEFAULT_NOTIFICATION_PLACEMENT;
};

const isNotificationPlacement = (value: unknown): value is NotificationPlacement => {
  return typeof value === 'string' && NOTIFICATION_PLACEMENTS.some((candidate) => candidate === value);
};
