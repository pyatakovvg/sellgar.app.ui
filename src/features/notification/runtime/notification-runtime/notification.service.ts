import { Inject, Injectable } from '../../../../di/injection/decorators';
import type { NotificationHandle, NotificationPayload } from '../../contract/notification-service';
import { NotificationServiceInterface } from '../../contract/notification-service';

import { NotificationRuntimeInterface } from './notification-runtime.interface.ts';

@Injectable()
export class NotificationService implements NotificationServiceInterface {
  constructor(
    @Inject(NotificationRuntimeInterface)
    private readonly runtime: NotificationRuntimeInterface,
  ) {}

  show(notification: NotificationPayload): NotificationHandle {
    return this.runtime.show(notification);
  }
}
