import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { RouterParamsConverterBindings } from '../../params/router-params-converter';
import { LocationServiceInterface } from '../location-service';
import { NavigateServiceInterface } from '../navigate-service';
import {
  NavigationContinuationService,
  NavigationContinuationServiceInterface,
} from '../navigation-continuation-service';
import { RouterServiceControllerInterface } from '../router-service-controller';

import { RouterService } from './router.service.ts';

export class RouterServiceBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new RouterParamsConverterBindings().register(registry);
    registry.bind(RouterService).toSelf().inSingletonScope();
    registry.bind(LocationServiceInterface).toService(RouterService);
    registry.bind(NavigateServiceInterface).toService(RouterService);
    registry.bind(NavigationContinuationServiceInterface).to(NavigationContinuationService).inSingletonScope();
    registry.bind(RouterServiceControllerInterface).toService(RouterService);
  }
}
