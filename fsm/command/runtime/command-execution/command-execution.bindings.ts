import type { BindingModuleInterface } from '../../../../core/di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';

import { CommandExecutionInterface } from './command-execution.interface.ts';
import { CommandExecution } from './command-execution.ts';

export class CommandExecutionBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(CommandExecutionInterface).to(CommandExecution).inSingletonScope();
  }
}
