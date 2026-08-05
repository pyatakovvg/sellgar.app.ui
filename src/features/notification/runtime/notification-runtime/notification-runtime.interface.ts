import type { NotificationHandle, NotificationPayload } from '../../contract/notification-service';

import type { NotificationRequest } from './notification-request.ts';

export type NotificationRuntimeListener = () => void;

export abstract class NotificationRuntimeInterface {
  abstract close(notificationId: string): void;

  abstract getSnapshot(): readonly NotificationRequest[];

  abstract pauseAutoClose(notificationId: string): void;

  abstract resumeAutoClose(notificationId: string): void;

  abstract show(notification: NotificationPayload): NotificationHandle;

  abstract subscribe(listener: NotificationRuntimeListener): () => void;
}
