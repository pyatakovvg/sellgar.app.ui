import { Injectable } from '../../../di/injection/decorators';

import type { NormalizedRuntimeErrorReport } from '../runtime-error-report';
import { RuntimeErrorReporterSinkInterface } from '../runtime-error-reporter-sink';

@Injectable()
export class ConsoleRuntimeErrorReporter extends RuntimeErrorReporterSinkInterface {
  report(report: NormalizedRuntimeErrorReport): void {
    globalThis.console.error({
      code: report.code,
      error: report.error,
      phase: report.phase,
      severity: report.severity,
      source: report.source,
    });
  }
}
