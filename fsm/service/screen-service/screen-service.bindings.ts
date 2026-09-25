import type { BindingModuleInterface } from '../../../core/di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../core/di/binding/binding-registry';
import { UseBindings } from '../../../core/di/composition/use-bindings';
import type { FsmToken } from '../../token/declaration/fsm-token';
import { ScreenRouteContext } from './screen-route-context.ts';
import { ScreenServiceInterface } from './screen-service.interface.ts';
import { ScreenService } from './screen.service.ts';

export const createScreenServiceOwner = (token: FsmToken): new () => object => {
  class ScreenServiceBindings implements BindingModuleInterface {
    register(registry: BindingRegistryInterface): void {
      registry.bind(ScreenRouteContext).toConstantValue({ token });
      registry.bind(ScreenServiceInterface).to(ScreenService).inSingletonScope();
    }
  }

  @UseBindings(ScreenServiceBindings)
  class ScreenServiceOwner {}

  return ScreenServiceOwner;
};
