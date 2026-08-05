import type { NotificationHandle, NotificationPayload } from './notification-payload.ts';

export abstract class NotificationServiceInterface {
  abstract show(notification: NotificationPayload): NotificationHandle;
}
