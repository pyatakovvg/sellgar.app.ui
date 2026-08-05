import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { RevalidateServiceInterface } from '../../contract/revalidate-service';
import { RevalidateService } from '../../runtime/revalidate-service';

export class RevalidateBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(RevalidateServiceInterface).to(RevalidateService).inSingletonScope();
  }
}
