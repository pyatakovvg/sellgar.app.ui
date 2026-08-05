import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { WidgetRuntimeFactory } from './widget-runtime-factory.ts';
import { WidgetRuntimeFactoryInterface } from './widget-runtime-factory.interface.ts';

export class WidgetRuntimeFactoryBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(WidgetRuntimeFactory).toSelf().inSingletonScope();
    registry.bind(WidgetRuntimeFactoryInterface).toService(WidgetRuntimeFactory);
  }
}
