import type React from 'react';

import type { ApplicationLifecycleListener } from '../../../../core/application/lifecycle/application-lifecycle';
import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import type { ApplicationNavigationListener } from '../../../../core/application/lifecycle/application';
import type { ApplicationRouterHistoryEntry } from '../../../../core/application/lifecycle/application';
import { NativeModuleExportResolver } from '../../../module/resolution/module-export-resolver';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { NativeRouterBridge } from '../../../router/bridge/native-router-bridge';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { createApplicationView, type ApplicationViewSource } from '../../rendering/application-host';

export interface ApplicationOptions {
  readonly routerBridge: NativeRouterBridge;
}

export abstract class Application extends CoreApplication<ModuleMetadata, ApplicationConfiguratorInterface> {
  private readonly nativeConfig: ApplicationConfig;
  private readonly nativeRouterBridge: NativeRouterBridge;

  constructor(options: ApplicationOptions) {
    const config = new ApplicationConfig();

    super(options.routerBridge, config, new NativeModuleExportResolver());
    this.nativeConfig = config;
    this.nativeRouterBridge = options.routerBridge;
  }

  createView(): React.FC {
    if (this.lifecycle.phase === 'created' || this.lifecycle.phase === 'composing') {
      throw new Error('Приложение нужно скомпоновать перед createView.');
    }

    const source: ApplicationViewSource = Object.freeze({
      components: this.nativeConfig.componentsValue,
      failRender: (error: unknown) => this.failRender(error),
      features: this.nativeConfig.featuresValue,
      getLifecycle: () => this.lifecycle,
      getNavigation: () => this.getNavigationSnapshot(),
      layouts: this.nativeConfig.layoutsValue,
      routing: this.nativeConfig.routingValue,
      routerBridge: this.nativeRouterBridge,
      getRouterRuntime: () => this.getRouterRuntime(),
      getRouterHistoryEntries: (): readonly ApplicationRouterHistoryEntry<ModuleMetadata>[] =>
        this.getRouterHistoryEntries(),
      scope: this.getApplicationScope(),
      subscribeLifecycle: (listener: ApplicationLifecycleListener) => this.subscribe(listener),
      subscribeNavigation: (listener: ApplicationNavigationListener) => this.subscribeNavigation(listener),
    });

    return createApplicationView(source);
  }
}
