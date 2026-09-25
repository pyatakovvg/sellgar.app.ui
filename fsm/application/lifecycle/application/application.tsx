import type React from 'react';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { SnapshotServiceBindings, SnapshotServiceInterface } from '../../../service/snapshot-service';
import { CommandsServiceBindings, CommandsServiceInterface } from '../../../service/commands-service';
import { FsmTransportInterface } from '../../../transport/contract/fsm-transport';
import { CommandExecutionBindings, CommandExecutionInterface } from '../../../command/runtime/command-execution';

import type { ApplicationLifecycleListener } from '../../../../core/application/lifecycle/application-lifecycle';
import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import type { ApplicationNavigationListener } from '../../../../core/application/lifecycle/application';
import type { RouterBridgeInterface } from '../../../../core/router/bridge/router-bridge';
import { FsmModuleExportResolver } from '../../../module/resolution/module-export-resolver';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { createApplicationView, type ApplicationViewSource } from '../../rendering/application-host';

export interface ApplicationOptions {
  readonly routerBridge: RouterBridgeInterface;
}

@UseBindings(SnapshotServiceBindings, CommandsServiceBindings, CommandExecutionBindings)
export abstract class Application extends CoreApplication<ModuleMetadata, ApplicationConfiguratorInterface> {
  private readonly fsmConfig: ApplicationConfig;
  private commands: CommandsServiceInterface | null = null;
  private execution: CommandExecutionInterface | null = null;
  private detachCommandConfirmation: (() => void) | null = null;

  constructor(options: ApplicationOptions) {
    const config = new ApplicationConfig();

    super(options.routerBridge, config, new FsmModuleExportResolver());
    this.fsmConfig = config;
  }

  compose(): void {
    super.compose();
    // Resolve at the application scope before a route can override LocationServiceInterface.
    this.getApplicationScope().get(SnapshotServiceInterface);
    if (this.getApplicationScope().has(FsmTransportInterface)) {
      this.execution = this.getApplicationScope().get(CommandExecutionInterface);
      this.commands = this.getApplicationScope().get(CommandsServiceInterface);
      this.detachCommandConfirmation ??= this.subscribeNavigation(() => {
        const navigation = this.getNavigationSnapshot();

        if (navigation.pending === null && navigation.navigation !== undefined) {
          this.execution?.confirm(navigation.navigation.state);
        }
      });
    }
  }

  async dispose(): Promise<void> {
    this.detachCommandConfirmation?.();
    this.detachCommandConfirmation = null;
    this.execution?.dispose();
    this.commands?.dispose();
    await super.dispose();
  }

  createView(): React.FC {
    if (this.lifecycle.phase === 'created' || this.lifecycle.phase === 'composing') {
      throw new Error('Приложение нужно скомпоновать перед createView.');
    }

    const source: ApplicationViewSource = Object.freeze({
      components: this.fsmConfig.componentsValue,
      createRenderException: (error: unknown) => this.createRenderException(error),
      failRender: (error: unknown) => this.failRender(error),
      featuresRuntime: this.getFeaturesRuntime(),
      features: this.fsmConfig.featuresValue,
      getLifecycle: () => this.lifecycle,
      getNavigation: () => this.getNavigationSnapshot(),
      layouts: this.fsmConfig.layoutsValue,
      routerRuntime: this.getRouterRuntime(),
      scope: this.getApplicationScope(),
      subscribeLifecycle: (listener: ApplicationLifecycleListener) => this.subscribe(listener),
      subscribeNavigation: (listener: ApplicationNavigationListener) => this.subscribeNavigation(listener),
    });

    return createApplicationView(source);
  }
}
