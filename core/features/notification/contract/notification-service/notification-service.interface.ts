import type { NotificationHandle, NotificationPayload } from './notification-payload.ts';

export abstract class NotificationServiceInterface<TContent = unknown> {
  abstract show(notification: NotificationPayload<TContent>): NotificationHandle;
}
