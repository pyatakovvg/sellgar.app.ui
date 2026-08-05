import { Injectable, MultiInject, Optional } from '../../../di/injection/decorators';
import type { RuntimeFailureReport } from '../../../runtime/failure';
import { RuntimeFailureReporterInterface, RuntimeFailureSinkInterface } from '../../../runtime/failure';

@Injectable()
export class RuntimeFailureReporter extends RuntimeFailureReporterInterface {
  constructor(
    @MultiInject(RuntimeFailureSinkInterface)
    @Optional()
    private readonly sinks: RuntimeFailureSinkInterface[] = [],
  ) {
    super();
  }

  async report(report: RuntimeFailureReport): Promise<void> {
    const results = await Promise.allSettled(
      this.sinks.map((sink) => {
        return Promise.resolve().then(() => sink.report(report));
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        fallbackReportSinkFailure(result.reason, report);
      }
    }
  }
}

const fallbackReportSinkFailure = (cause: unknown, report: RuntimeFailureReport): void => {
  globalThis.console.error({
    cause,
    failedRuntimeFailureSink: true,
    runtimeFailureId: report.failure.id,
  });
};
