import type { BindingModuleInterface } from '../../../core/di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../core/di/binding/binding-registry';
import { CommandsServiceInterface } from './commands-service.interface';
import { CommandsService } from './commands.service';

export class CommandsServiceBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(CommandsServiceInterface).to(CommandsService).inSingletonScope();
  }
}
