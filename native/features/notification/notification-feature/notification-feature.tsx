import React from 'react';

import { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { NotificationBindings } from '../../../../core/features/notification/binding/notification-bindings';
import { configureApplicationFeatureRenderer } from '../../../application/feature/application-feature-renderer';
import { PresentationLayer } from '../../../application/rendering/presentation-layer';
import type { NotificationPresentation } from '../declaration/notification-presentation';
import { NotificationLayer } from '../presentation/notification-layer';

export interface NotificationFeatureOptions {
  readonly presentation: NotificationPresentation;
}

@UseBindings(NotificationBindings)
export class NotificationFeature extends ApplicationFeatureInterface {
  private constructor(options: NotificationFeatureOptions) {
    super();
    configureApplicationFeatureRenderer(this, PresentationLayer.Notification, () => (
      <NotificationLayer presentation={options.presentation} />
    ));
  }

  static configure(options: NotificationFeatureOptions): NotificationFeature {
    return new NotificationFeature(options);
  }
}
