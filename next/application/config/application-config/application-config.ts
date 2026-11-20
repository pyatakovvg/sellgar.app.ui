import { ApplicationConfig as CoreApplicationConfig } from '../../../../core/application/config/application-config';
import type { ApplicationConfiguratorInterface as CoreApplicationConfigurator } from '../../../../core/application/config/application-configurator';
import type { ApplicationStateToken } from '../../state/application-state';
import type React from 'react';

import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';

export interface ApplicationComponents {
  readonly fallback?: React.ReactNode;
}

export type ApplicationConfiguratorInterface = Pick<
  CoreApplicationConfigurator,
  'features' | 'providers' | 'initializers' | 'metrics' | 'metadata'
> & {
  states(states: readonly ApplicationStateToken<any>[]): void;
  components(components: ApplicationComponents): void;
};

export class ApplicationConfig extends CoreApplicationConfig {
  private stateTokens: readonly ApplicationStateToken<any>[] = [];
  private applicationComponents: ApplicationComponents = {};

  get componentsValue(): ApplicationComponents {
    return this.applicationComponents;
  }

  components(components: ApplicationComponents): void {
    this.applicationComponents = Object.freeze({ ...components });
  }

  get statesValue(): readonly ApplicationStateToken<any>[] {
    return this.stateTokens;
  }

  states(states: readonly ApplicationStateToken<any>[]): void {
    const keys = states.map((token) => token.key);
    if (new Set(keys).size !== keys.length) throw new Error('Application state keys must be unique.');
    this.stateTokens = Object.freeze([...states]);
  }

  constructor() {
    super();
    // Core requires a nonempty declaration. This route is never activated;
    // Next owns the route tree and does not synchronize it with this router.
    this.router(
      new Router({
        routes: [
          new Route({
            load: async () => {
              throw new Error('Контекст приложения Next не активирует маршруты фреймворка.');
            },
          }),
        ],
      }),
    );
  }
}
