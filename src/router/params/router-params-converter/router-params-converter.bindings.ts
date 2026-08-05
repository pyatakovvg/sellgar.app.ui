import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { ClassTransformerRouterParamsConverter } from '../class-transformer-router-params-converter';

import { RouterParamsConverterInterface } from './router-params-converter.interface.ts';

export class RouterParamsConverterBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(RouterParamsConverterInterface).to(ClassTransformerRouterParamsConverter).inSingletonScope();
  }
}
