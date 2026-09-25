import React from 'react';

import type {
  ApplicationFeatureInterface,
  ApplicationFeatureToken,
} from '../../../../core/application/feature/application-feature';
import { Feature } from '../../../../shared/application/feature/application-feature';
import { NavigationBlockerBindings } from '../../../../core/features/navigation-blocker/binding/navigation-blocker-bindings';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { PresentationLayer } from '../../../../shared/application/rendering/presentation-layer';
import { ReactNavigationBlockerBindings } from '../binding/navigation-blocker-bindings';
import type { NavigationBlockerPresentation } from '../declaration/navigation-blocker-presentation';
import { NavigationBlockerLayer } from '../presentation/navigation-blocker-layer';

export interface NavigationBlockerFeatureOptions {
  readonly presentation: NavigationBlockerPresentation;
}

export class NavigationBlockerFeature {
  private constructor() {}

  static configure(options: NavigationBlockerFeatureOptions): ApplicationFeatureToken {
    @UseBindings(NavigationBlockerBindings, ReactNavigationBlockerBindings)
    @Feature({
      presentation: {
        layer: PresentationLayer.Modal,
        view: <NavigationBlockerLayer presentation={options.presentation} />,
      },
    })
    class ConfiguredNavigationBlockerFeature implements ApplicationFeatureInterface {}

    return ConfiguredNavigationBlockerFeature;
  }
}
