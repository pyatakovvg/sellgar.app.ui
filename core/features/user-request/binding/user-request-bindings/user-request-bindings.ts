import { BindingModuleInterface } from '../../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../../di/binding/binding-registry';
import { UserRequestServiceInterface } from '../../contract/user-request-service';
import {
  UserRequestRuntime,
  UserRequestRuntimeInterface,
  UserRequestService,
} from '../../runtime/user-request-runtime';

export class UserRequestBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(UserRequestRuntimeInterface).to(UserRequestRuntime).inSingletonScope();
    registry.bind(UserRequestServiceInterface).to(UserRequestService).inSingletonScope();
  }
}
