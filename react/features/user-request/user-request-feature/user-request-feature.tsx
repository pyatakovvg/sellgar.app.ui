import React from 'react';

import type {
  ApplicationFeatureInterface,
  ApplicationFeatureToken,
} from '../../../../core/application/feature/application-feature';
import { Feature } from '../../../../shared/application/feature/application-feature';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { UserRequestBindings } from '../../../../core/features/user-request/binding/user-request-bindings';
import { PresentationLayer } from '../../../../shared/application/rendering/presentation-layer';
import type { UserRequestPresentation } from '../declaration/user-request-presentation';
import { UserRequestLayer } from '../presentation/user-request-layer';

export interface UserRequestFeatureOptions {
  readonly presentation: UserRequestPresentation;
}

export class UserRequestFeature {
  private constructor() {}

  static configure(options: UserRequestFeatureOptions): ApplicationFeatureToken {
    @UseBindings(UserRequestBindings)
    @Feature({
      presentation: {
        layer: PresentationLayer.Modal,
        view: <UserRequestLayer presentation={options.presentation} />,
      },
    })
    class ConfiguredUserRequestFeature implements ApplicationFeatureInterface {}

    return ConfiguredUserRequestFeature;
  }
}
