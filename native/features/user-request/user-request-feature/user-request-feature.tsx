import React from 'react';

import { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { UserRequestBindings } from '../../../../core/features/user-request/binding/user-request-bindings';
import { configureApplicationFeatureRenderer } from '../../../application/feature/application-feature-renderer';
import { PresentationLayer } from '../../../application/rendering/presentation-layer';
import type { UserRequestPresentation } from '../declaration/user-request-presentation';
import { UserRequestLayer } from '../presentation/user-request-layer';

export interface UserRequestFeatureOptions {
  readonly presentation: UserRequestPresentation;
}

@UseBindings(UserRequestBindings)
export class UserRequestFeature extends ApplicationFeatureInterface {
  private constructor(options: UserRequestFeatureOptions) {
    super();
    configureApplicationFeatureRenderer(this, PresentationLayer.Modal, () => (
      <UserRequestLayer presentation={options.presentation} />
    ));
  }

  static configure(options: UserRequestFeatureOptions): UserRequestFeature {
    return new UserRequestFeature(options);
  }
}
