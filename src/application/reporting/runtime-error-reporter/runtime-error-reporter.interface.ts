import type { RuntimeErrorReport } from '../runtime-error-report';

export abstract class RuntimeErrorReporterInterface {
  abstract report(report: RuntimeErrorReport): void | Promise<void>;
}
