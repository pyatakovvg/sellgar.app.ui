import type React from 'react';

import type { NotificationStatus } from '../../contract/notification-service';
import type { NotificationViewProps } from '../../react/notification-view-props';

export interface NotificationPresentationEntries {
  readonly destructive?: React.ComponentType<NotificationViewProps>;
  readonly info?: React.ComponentType<NotificationViewProps>;
  readonly success?: React.ComponentType<NotificationViewProps>;
}

export class NotificationPresentationRegistry {
  private entries: NotificationPresentationEntries = {};

  destructive(view: React.ComponentType<NotificationViewProps>): void {
    this.entries = {
      ...this.entries,
      destructive: view,
    };
  }

  getEntries(): NotificationPresentationEntries {
    return { ...this.entries };
  }

  info(view: React.ComponentType<NotificationViewProps>): void {
    this.entries = {
      ...this.entries,
      info: view,
    };
  }

  success(view: React.ComponentType<NotificationViewProps>): void {
    this.entries = {
      ...this.entries,
      success: view,
    };
  }

  has(status: NotificationStatus): boolean {
    return this.entries[status] !== undefined;
  }
}
