import type { NotificationHandle, NotificationPayload } from '../../contract/notification-service';

import type { NotificationRequest } from './notification-request.ts';

export type NotificationRuntimeListener = () => void;

export abstract class NotificationRuntimeInterface {
  abstract close(notificationId: string): void;

  abstract dispose(): void;

  abstract getSnapshot<TContent = unknown>(): readonly NotificationRequest<TContent>[];

  abstract pauseAutoClose(notificationId: string): void;

  abstract resumeAutoClose(notificationId: string): void;

  abstract show<TContent>(notification: NotificationPayload<TContent>): NotificationHandle;

  abstract subscribe(listener: NotificationRuntimeListener): () => void;
}
