import type { NotificationRequest } from '../../runtime/notification-runtime';

export interface NotificationViewProps {
  readonly close: () => void;
  readonly notification: NotificationRequest;
}
