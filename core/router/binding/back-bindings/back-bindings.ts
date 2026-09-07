import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { BackRuntime, BackRuntimeInterface } from '../../runtime/back-runtime';

export class BackBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(BackRuntimeInterface).to(BackRuntime).inSingletonScope();
  }
}
