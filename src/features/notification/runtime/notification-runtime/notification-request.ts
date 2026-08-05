import type {
  NotificationPayload,
  NotificationPlacement,
  NotificationStatus,
} from '../../contract/notification-service';

export interface NotificationRequest extends NotificationPayload {
  readonly id: string;
  readonly placement: NotificationPlacement;
  readonly status: NotificationStatus;
}
