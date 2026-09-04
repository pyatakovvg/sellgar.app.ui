import type { NotificationRequest } from '../../contract/notification-service';

export interface NotificationViewProps {
  readonly notification: NotificationRequest;

  close(): void;
}
