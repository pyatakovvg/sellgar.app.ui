import React from 'react';

import type {
  ApplicationFeatureInterface,
  ApplicationFeatureToken,
} from '../../../../core/application/feature/application-feature';
import { Feature } from '../../../../shared/application/feature/application-feature';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { NotificationBindings } from '../../../../core/features/notification/binding/notification-bindings';
import { PresentationLayer } from '../../../../shared/application/rendering/presentation-layer';
import type { NotificationPresentation } from '../declaration/notification-presentation';
import { NotificationLayer } from '../presentation/notification-layer';

export interface NotificationFeatureOptions {
  readonly presentation: NotificationPresentation;
}

export class NotificationFeature {
  private constructor() {}

  static configure(options: NotificationFeatureOptions): ApplicationFeatureToken {
    @UseBindings(NotificationBindings)
    @Feature({
      presentation: {
        layer: PresentationLayer.Notification,
        view: <NotificationLayer presentation={options.presentation} />,
      },
    })
    class ConfiguredNotificationFeature implements ApplicationFeatureInterface {}

    return ConfiguredNotificationFeature;
  }
}
