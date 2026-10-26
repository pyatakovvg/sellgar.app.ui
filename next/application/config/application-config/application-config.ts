import { ApplicationConfig as CoreApplicationConfig } from '../../../../core/application/config/application-config';
import type { ApplicationConfiguratorInterface as CoreApplicationConfigurator } from '../../../../core/application/config/application-configurator';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';

export type ApplicationConfiguratorInterface = Pick<
  CoreApplicationConfigurator,
  'features' | 'initializers' | 'metrics'
>;

export class ApplicationConfig extends CoreApplicationConfig {
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
