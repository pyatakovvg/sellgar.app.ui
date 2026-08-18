import React from 'react';

import { ApplicationFeatureInterface } from '../../../application/feature/application-feature';
import { UseBindings } from '../../../di/composition/use-bindings';
import { NavigationBlockerBindings } from '../binding';
import type { NavigationBlockerPresentation } from '../declaration/navigation-blocker-presentation';
import { NavigationBlockerLayer } from '../react/navigation-blocker-layer';

export interface NavigationBlockerFeatureOptions {
  readonly presentation: NavigationBlockerPresentation;
}

@UseBindings(NavigationBlockerBindings)
export class NavigationBlockerFeature implements ApplicationFeatureInterface {
  private constructor(private readonly options: NavigationBlockerFeatureOptions) {}

  static configure(options: NavigationBlockerFeatureOptions): NavigationBlockerFeature {
    return new NavigationBlockerFeature(options);
  }

  createLayer(): React.ReactNode {
    return <NavigationBlockerLayer presentation={this.options.presentation} />;
  }
}
