import type { BindingRegistryInterface } from '../../../../di/binding/binding-registry';
import { RuntimeScope } from '../../base/runtime-scope';

export class RouteScope extends RuntimeScope {
  constructor(parent: RuntimeScope, registerBindings?: (registry: BindingRegistryInterface) => void) {
    super(parent);

    if (registerBindings) {
      this.register(registerBindings);
    }
  }
}
