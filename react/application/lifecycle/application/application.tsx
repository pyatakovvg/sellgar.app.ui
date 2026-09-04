import type React from 'react';

import type { ApplicationLifecycleListener } from '../../../../core/application/lifecycle/application-lifecycle';
import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import type { ApplicationNavigationListener } from '../../../../core/application/lifecycle/application';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import { hasRouterBridgeHrefCapability } from '../../../../core/router/bridge/router-bridge';
import type { RouterBridgeInterface } from '../../../../core/router/bridge/router-bridge';
import { ReactModuleExportResolver } from '../../../module/resolution/module-export-resolver';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { createApplicationView, type ApplicationViewSource } from '../../rendering/application-host';

export interface ApplicationOptions {
  readonly routerBridge: RouterBridgeInterface;
}

export abstract class Application extends CoreApplication<ModuleMetadata, ApplicationConfiguratorInterface> {
  private readonly reactConfig: ApplicationConfig;
  private readonly reactRouterBridge: RouterBridgeInterface;

  constructor(options: ApplicationOptions) {
    const config = new ApplicationConfig();

    super(options.routerBridge, config, new ReactModuleExportResolver());
    this.reactConfig = config;
    this.reactRouterBridge = options.routerBridge;
  }

  createView(): React.FC {
    if (this.lifecycle.phase === 'created' || this.lifecycle.phase === 'composing') {
      throw new Error('Приложение нужно скомпоновать перед createView.');
    }

    const source: ApplicationViewSource = Object.freeze({
      components: this.reactConfig.componentsValue,
      createHref: (navigation: NavigationState) => this.createHref(navigation),
      failRender: (error: unknown) => this.failRender(error),
      features: this.reactConfig.featuresValue,
      getLifecycle: () => this.lifecycle,
      getNavigation: () => this.getNavigationSnapshot(),
      layouts: this.reactConfig.layoutsValue,
      routing: this.reactConfig.routingValue,
      routerRuntime: this.getRouterRuntime(),
      scope: this.getApplicationScope(),
      subscribeLifecycle: (listener: ApplicationLifecycleListener) => this.subscribe(listener),
      subscribeNavigation: (listener: ApplicationNavigationListener) => this.subscribeNavigation(listener),
    });

    return createApplicationView(source);
  }

  private createHref(navigation: NavigationState): string {
    if (!hasRouterBridgeHrefCapability(this.reactRouterBridge)) {
      throw new Error('Текущий RouterBridge не поддерживает shareable href.');
    }

    return this.reactRouterBridge.createHref(navigation);
  }
}
