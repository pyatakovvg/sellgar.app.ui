import type { NormalizedRuntimeErrorReport } from '../runtime-error-report';

export abstract class RuntimeErrorReporterSinkInterface {
  abstract report(report: NormalizedRuntimeErrorReport): void | Promise<void>;
}
