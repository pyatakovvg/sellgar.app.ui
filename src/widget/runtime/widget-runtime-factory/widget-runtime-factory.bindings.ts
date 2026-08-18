import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { WidgetRuntimeFactory } from './widget-runtime-factory.ts';
import { WidgetRuntimeFactoryInterface } from './widget-runtime-factory.interface.ts';
import { WidgetPreloaderInterface } from './widget-preloader.interface.ts';

export class WidgetRuntimeFactoryBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(WidgetRuntimeFactory).toSelf().inSingletonScope();
    registry.bind(WidgetRuntimeFactoryInterface).toService(WidgetRuntimeFactory);
    registry.bind(WidgetPreloaderInterface).toService(WidgetRuntimeFactory);
  }
}
