import { BindingModuleInterface } from '../../../../../core/di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../../../core/di/binding/binding-registry';
import { NavigationBlockerPresentationRegistry } from '../../presentation/navigation-blocker-presentation-registry';

export class NativeNavigationBlockerBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(NavigationBlockerPresentationRegistry).toSelf().inSingletonScope();
  }
}
