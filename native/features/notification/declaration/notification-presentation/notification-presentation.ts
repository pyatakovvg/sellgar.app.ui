import type { NotificationStatus } from '../../../../../core/features/notification/contract/notification-service';

import { NotificationPresentationNotConfiguredException } from './notification-presentation-not-configured.exception.ts';
import { NotificationPresentationRegistry, type NotificationView } from './notification-presentation-registry.ts';

export type NotificationPresentationDefinition = (registry: NotificationPresentationRegistry) => void;

export class NotificationPresentation {
  private constructor(private readonly entries: ReadonlyMap<NotificationStatus, NotificationView>) {}

  static define(definition: NotificationPresentationDefinition): NotificationPresentation {
    const registry = new NotificationPresentationRegistry();

    definition(registry);

    return new NotificationPresentation(registry.getEntries());
  }

  resolve(status: NotificationStatus): NotificationView {
    const view = this.entries.get(status);

    if (!view) {
      throw new NotificationPresentationNotConfiguredException(status);
    }

    return view;
  }
}
