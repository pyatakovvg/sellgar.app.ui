import type React from 'react';

import type { NotificationStatus } from '../../../../../core/features/notification/contract/notification-service';
import type { NotificationViewProps } from '../../presentation/notification-view-props';

export type NotificationView = React.ComponentType<NotificationViewProps>;

export class NotificationPresentationRegistry {
  private readonly entries = new Map<NotificationStatus, NotificationView>();

  destructive(view: NotificationView): void {
    this.entries.set('destructive', view);
  }

  getEntries(): ReadonlyMap<NotificationStatus, NotificationView> {
    return new Map(this.entries);
  }

  info(view: NotificationView): void {
    this.entries.set('info', view);
  }

  success(view: NotificationView): void {
    this.entries.set('success', view);
  }
}
