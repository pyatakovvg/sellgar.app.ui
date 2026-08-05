import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { ConsoleRuntimeErrorReporter } from '../console-runtime-error-reporter';
import { RuntimeErrorReporterSinkInterface } from '../runtime-error-reporter-sink';

import { RuntimeErrorReporter } from './runtime-error-reporter.ts';
import { RuntimeErrorReporterInterface } from './runtime-error-reporter.interface.ts';

export class RuntimeErrorReporterBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(RuntimeErrorReporterInterface).to(RuntimeErrorReporter).inSingletonScope();
    registry.bind(RuntimeErrorReporterSinkInterface).to(ConsoleRuntimeErrorReporter).inSingletonScope();
  }
}
