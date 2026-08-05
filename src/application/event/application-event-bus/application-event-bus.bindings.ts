import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { ApplicationEventBusInterface } from './application-event-bus.interface.ts';
import { ApplicationEventBus } from './application-event-bus.ts';

export class ApplicationEventBusBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(ApplicationEventBusInterface).to(ApplicationEventBus).inSingletonScope();
  }
}
