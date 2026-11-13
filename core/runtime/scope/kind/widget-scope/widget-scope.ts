import type { BindingRegistryInterface } from '../../../../di/binding/binding-registry';
import { RuntimeScope } from '../../base/runtime-scope';
import { LoaderTransactionService } from '../../../../controller/runtime/loader-transaction';

export class WidgetScope extends RuntimeScope {
  constructor(parent: RuntimeScope, registerBindings?: (registry: BindingRegistryInterface) => void) {
    super(parent);

    const transactions = new LoaderTransactionService();
    this.register((registry) => registry.bind(LoaderTransactionService).toConstantValue(transactions));
    this.onDispose(() => transactions.dispose());

    if (registerBindings) {
      this.register(registerBindings);
    }
  }
}
