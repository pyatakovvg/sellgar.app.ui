import { Inject, Injectable } from '../../../../di/injection/decorators';
import {
  NotificationServiceInterface,
  type NotificationHandle,
  type NotificationPayload,
} from '../../contract/notification-service';

import { NotificationRuntimeInterface } from './notification-runtime.interface.ts';

@Injectable()
export class NotificationService extends NotificationServiceInterface<unknown> {
  constructor(@Inject(NotificationRuntimeInterface) private readonly runtime: NotificationRuntimeInterface) {
    super();
  }

  show(notification: NotificationPayload<unknown>): NotificationHandle {
    return this.runtime.show(notification);
  }
}
