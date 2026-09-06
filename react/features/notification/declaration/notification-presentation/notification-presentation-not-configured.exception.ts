import { Exception } from '../../../../../core/exception/contract/exception';
import type { NotificationStatus } from '../../../../../core/features/notification/contract/notification-service';

export class NotificationPresentationNotConfiguredException extends Exception {
  constructor(status: NotificationStatus) {
    super(`Не настроено представление для notification "${status}".`);
    this.name = 'NotificationPresentationNotConfiguredException';
  }
}
