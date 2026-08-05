import React from 'react';

import { ApplicationFeatureInterface } from '../../../application/feature/application-feature';
import { UseBindings } from '../../../di/composition/use-bindings';
import { NotificationBindings } from '../binding';
import { NotificationPresentation } from '../declaration/notification-presentation';
import { NotificationLayer } from '../react/notification-layer';

export interface NotificationFeatureOptions {
  readonly presentation: NotificationPresentation;
}

@UseBindings(NotificationBindings)
export class NotificationFeature extends ApplicationFeatureInterface {
  private constructor(private readonly options: NotificationFeatureOptions) {
    super();
  }

  static configure(options: NotificationFeatureOptions): NotificationFeature {
    return new NotificationFeature(options);
  }

  createLayer(): React.ReactNode {
    return <NotificationLayer presentation={this.options.presentation} />;
  }
}
