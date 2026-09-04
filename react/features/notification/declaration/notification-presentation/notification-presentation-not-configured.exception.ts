import type { NotificationStatus } from '../../../../../core/features/notification/contract/notification-service';

export class NotificationPresentationNotConfiguredException extends Error {
  constructor(status: NotificationStatus) {
    super(`Не настроено представление для notification "${status}".`);
    this.name = 'NotificationPresentationNotConfiguredException';
  }
}
