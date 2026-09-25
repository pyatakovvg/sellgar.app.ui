import type { BindingModuleInterface } from '../../../core/di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../core/di/binding/binding-registry';
import { SnapshotServiceInterface } from './snapshot-service.interface';
import { SnapshotService } from './snapshot.service';

export class SnapshotServiceBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(SnapshotServiceInterface).to(SnapshotService).inSingletonScope();
  }
}
