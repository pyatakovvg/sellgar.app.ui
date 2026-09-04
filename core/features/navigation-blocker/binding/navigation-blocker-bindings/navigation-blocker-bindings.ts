import { BindingModuleInterface } from '../../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../../di/binding/binding-registry';
import { NavigationBlockerRuntime, NavigationBlockerRuntimeInterface } from '../../runtime/navigation-blocker-runtime';

export class NavigationBlockerBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(NavigationBlockerRuntimeInterface).to(NavigationBlockerRuntime).inSingletonScope();
  }
}
