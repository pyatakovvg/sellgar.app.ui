import type { NotificationPayload, NotificationStatus } from '../../contract/notification-service';

export interface NotificationRequest<TContent = unknown> extends NotificationPayload<TContent> {
  readonly id: string;
  readonly status: NotificationStatus;
}
