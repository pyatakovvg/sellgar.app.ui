import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { FrameServiceInterface } from './frame-service.interface.ts';
import { FrameService } from './frame.service.ts';

export class FrameBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(FrameServiceInterface).to(FrameService).inSingletonScope();
  }
}
