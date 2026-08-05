import type React from 'react';

import type { NotificationStatus } from '../../contract/notification-service';
import type { NotificationViewProps } from '../../react/notification-view-props';

import {
  NotificationPresentationRegistry,
  type NotificationPresentationEntries,
} from './notification-presentation-registry.ts';
import { NotificationPresentationNotConfiguredException } from './notification-presentation-not-configured.exception.ts';

export type NotificationPresentationDefinition = (registry: NotificationPresentationRegistry) => void;

export class NotificationPresentation {
  private constructor(private readonly entries: NotificationPresentationEntries) {}

  static define(definition: NotificationPresentationDefinition): NotificationPresentation {
    const registry = new NotificationPresentationRegistry();

    definition(registry);

    return new NotificationPresentation(registry.getEntries());
  }

  resolve(status: NotificationStatus): React.ComponentType<NotificationViewProps> {
    const view = this.entries[status];

    if (!view) {
      throw new NotificationPresentationNotConfiguredException(status);
    }

    return view;
  }
}
