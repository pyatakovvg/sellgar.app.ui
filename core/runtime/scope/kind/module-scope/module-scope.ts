import type { MetadataValues } from '../../../../metadata/declaration/metadata';
import { MetadataService } from '../../../../metadata/runtime/metadata-service';
import { MetadataServiceInterface } from '../../../../metadata/service/metadata-service';
import type { BindingRegistryInterface } from '../../../../di/binding/binding-registry';
import { RuntimeScope } from '../../base/runtime-scope';

export class ModuleScope extends RuntimeScope {
  constructor(parent: RuntimeScope, registerBindings?: (registry: BindingRegistryInterface) => void) {
    super(parent);

    if (registerBindings) {
      this.register(registerBindings);
    }
  }
  bindMetadata(defaults: MetadataValues): void {
    const metadata = new MetadataService(defaults);
    this.register((registry) => registry.bind(MetadataServiceInterface).toConstantValue(metadata));
    this.onDispose(() => metadata.dispose());
  }
}
