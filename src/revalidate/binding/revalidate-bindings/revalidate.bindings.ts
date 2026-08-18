import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { RevalidateRegistryInterface, RevalidateServiceInterface } from '../../contract/revalidate-service';
import { RevalidateService } from '../../runtime/revalidate-service';

export class RevalidateBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(RevalidateService).toSelf().inSingletonScope();
    registry.bind(RevalidateServiceInterface).toService(RevalidateService);
    registry.bind(RevalidateRegistryInterface).toService(RevalidateService);
  }
}
