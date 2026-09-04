import React from 'react';

import { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { NavigationBlockerBindings } from '../../../../core/features/navigation-blocker/binding/navigation-blocker-bindings';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { configureApplicationFeatureRenderer } from '../../../application/feature/application-feature-renderer';
import { PresentationLayer } from '../../../application/rendering/presentation-layer';
import { ReactNavigationBlockerBindings } from '../binding/navigation-blocker-bindings';
import type { NavigationBlockerPresentation } from '../declaration/navigation-blocker-presentation';
import { NavigationBlockerLayer } from '../presentation/navigation-blocker-layer';

export interface NavigationBlockerFeatureOptions {
  readonly presentation: NavigationBlockerPresentation;
}

@UseBindings(NavigationBlockerBindings, ReactNavigationBlockerBindings)
export class NavigationBlockerFeature extends ApplicationFeatureInterface {
  private constructor(options: NavigationBlockerFeatureOptions) {
    super();
    configureApplicationFeatureRenderer(this, PresentationLayer.Modal, () => (
      <NavigationBlockerLayer presentation={options.presentation} />
    ));
  }

  static configure(options: NavigationBlockerFeatureOptions): NavigationBlockerFeature {
    return new NavigationBlockerFeature(options);
  }
}
