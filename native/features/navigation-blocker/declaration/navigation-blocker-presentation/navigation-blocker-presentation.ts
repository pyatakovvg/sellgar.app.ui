import type React from 'react';

import type { NavigationBlockerViewProps } from '../../presentation/navigation-blocker-view-props';

export class NavigationBlockerPresentation {
  private constructor(private readonly view: React.ComponentType<NavigationBlockerViewProps>) {}

  static define(view: React.ComponentType<NavigationBlockerViewProps>): NavigationBlockerPresentation {
    return new NavigationBlockerPresentation(view);
  }

  resolve(): React.ComponentType<NavigationBlockerViewProps> {
    return this.view;
  }
}
