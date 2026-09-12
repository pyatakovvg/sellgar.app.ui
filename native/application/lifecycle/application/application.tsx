import type React from 'react';

import type { ApplicationLifecycleListener } from '../../../../core/application/lifecycle/application-lifecycle';
import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import type { ApplicationNavigationListener } from '../../../../core/application/lifecycle/application';
import { NativeModuleExportResolver } from '../../../module/resolution/module-export-resolver';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { NativeRouterBridge } from '../../../router/bridge/native-router-bridge';
import { NativeBackRuntime } from '../../../router/runtime/native-back-runtime';
import { NativePresentationRuntime } from '../../../router/runtime/native-presentation-runtime';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { createApplicationView, type ApplicationViewSource } from '../../rendering/application-host';

export interface ApplicationOptions {
  readonly routerBridge: NativeRouterBridge;
}

export abstract class Application extends CoreApplication<ModuleMetadata, ApplicationConfiguratorInterface> {
  private readonly nativeConfig: ApplicationConfig;
  private readonly nativeRouterBridge: NativeRouterBridge;
  private backRuntime: NativeBackRuntime | null = null;
  private presentationRuntime: NativePresentationRuntime | null = null;

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

    this.backRuntime?.dispose();
    this.presentationRuntime?.dispose();
    this.backRuntime = null;
    this.presentationRuntime = null;

    let backRuntime: NativeBackRuntime | null = null;
    let presentationRuntime: NativePresentationRuntime | null = null;

    try {
      presentationRuntime = new NativePresentationRuntime({
        components: this.nativeConfig.componentsValue,
        getHistoryEntries: () => this.getRouterHistoryEntries(),
        getNavigation: () => this.getNavigationSnapshot(),
        getRouterRuntime: () => this.getRouterRuntime(),
        getRuntimeEntries: () => this.getRouterRuntimeEntries(),
        routerBridge: this.nativeRouterBridge,
        subscribeNavigation: (listener: ApplicationNavigationListener) => this.subscribeNavigation(listener),
      });
      backRuntime = new NativeBackRuntime(this.nativeRouterBridge, {
        getLifecycle: () => this.lifecycle,
        subscribeLifecycle: (listener: ApplicationLifecycleListener) => this.subscribe(listener),
      });
    } catch (error) {
      backRuntime?.dispose();
      presentationRuntime?.dispose();
      throw error;
    }

    this.backRuntime = backRuntime;
    this.presentationRuntime = presentationRuntime;

    const source: ApplicationViewSource = Object.freeze({
      components: this.nativeConfig.componentsValue,
      createRenderException: (error: unknown) => this.createRenderException(error),
      failRender: (error: unknown) => this.failRender(error),
      features: this.nativeConfig.featuresValue,
      getLifecycle: () => this.lifecycle,
      layouts: this.nativeConfig.layoutsValue,
      routing: this.nativeConfig.routingValue,
      routerBridge: this.nativeRouterBridge,
      presentationRuntime,
      getRouterRuntime: () => this.getRouterRuntime(),
      requestBack: backRuntime.request,
      scope: this.getApplicationScope(),
      subscribeLifecycle: (listener: ApplicationLifecycleListener) => this.subscribe(listener),
    });

    return createApplicationView(source);
  }

  override async dispose(): Promise<void> {
    this.backRuntime?.dispose();
    this.backRuntime = null;
    this.presentationRuntime?.dispose();
    this.presentationRuntime = null;
    await super.dispose();
  }
}
