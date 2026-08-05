import { Injectable, MultiInject, Optional } from '../../../di/injection/decorators';

import { getRuntimeErrorDescriptor } from '../runtime-error-report';
import type { NormalizedRuntimeErrorReport, RuntimeErrorReport } from '../runtime-error-report';
import { RuntimeErrorReporterSinkInterface } from '../runtime-error-reporter-sink';

import { RuntimeErrorReporterInterface } from './runtime-error-reporter.interface.ts';

@Injectable()
export class RuntimeErrorReporter extends RuntimeErrorReporterInterface {
  constructor(
    @MultiInject(RuntimeErrorReporterSinkInterface)
    @Optional()
    private readonly sinks: RuntimeErrorReporterSinkInterface[] = [],
  ) {
    super();
  }

  async report(report: RuntimeErrorReport): Promise<void> {
    const normalizedReport = normalizeRuntimeErrorReport(report);
    const results = await Promise.allSettled(
      this.sinks.map((sink) => {
        return Promise.resolve().then(() => sink.report(normalizedReport));
      }),
    );

    results.forEach((result) => {
      if (result.status === 'rejected') {
        fallbackReport({
          code: 'application.disposable.dispose_failed',
          error: result.reason,
          phase: 'application.dispose',
          severity: 'warning',
          source: 'application.disposable',
        });
      }
    });
  }
}

export const normalizeRuntimeErrorReport = (report: RuntimeErrorReport): NormalizedRuntimeErrorReport => {
  const descriptor = getRuntimeErrorDescriptor(report.code);

  return {
    code: report.code,
    error: report.error,
    phase: descriptor.phase,
    severity: report.severity ?? descriptor.severity,
    source: descriptor.source,
  };
};

const fallbackReport = (report: NormalizedRuntimeErrorReport): void => {
  globalThis.console.error({
    code: report.code,
    error: report.error,
    phase: report.phase,
    severity: report.severity,
    source: report.source,
  });
};
