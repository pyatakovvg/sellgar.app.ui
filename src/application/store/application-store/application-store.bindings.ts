import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { ApplicationStoreInterface } from './application-store.interface.ts';
import { ApplicationStore } from './application-store.ts';

export class ApplicationStoreBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(ApplicationStoreInterface).to(ApplicationStore).inSingletonScope();
  }
}
