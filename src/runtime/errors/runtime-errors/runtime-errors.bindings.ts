import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { RuntimeErrorsInterface } from './runtime-errors.interface.ts';
import { RuntimeErrors } from './runtime-errors.ts';

export class RuntimeErrorsBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(RuntimeErrorsInterface).to(RuntimeErrors).inSingletonScope();
  }
}
