import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { RuntimeScope } from '../base';

export class ModuleScope extends RuntimeScope {
  constructor(parent?: RuntimeScope, registerBindings?: (registry: BindingRegistryInterface) => void) {
    super(parent);

    if (registerBindings) {
      this.register(registerBindings);
    }
  }
}
