import { Injectable } from '../../../di/injection/decorators';
import {
  ApplicationReporterInterface,
  ApplicationReportDispatcherInterface,
  createApplicationReport,
  type ApplicationErrorReportInput,
  type ApplicationReport,
  type ApplicationReportHandlerInterface,
  type ApplicationReportInput,
  type ApplicationReportLevel,
} from '../application-report';

@Injectable()
export class ApplicationReporter extends ApplicationReporterInterface implements ApplicationReportDispatcherInterface {
  private active = false;
  private readonly deliveries = new Set<Promise<void>>();
  private handlers: readonly ApplicationReportHandlerInterface[] = [];
  private readonly pendingReports: ApplicationReport[] = [];

  activate(handlers: readonly ApplicationReportHandlerInterface[]): void {
    this.handlers = [...handlers];
    this.active = true;

    const pendingReports = this.pendingReports.splice(0);

    if (this.handlers.length === 0) {
      return;
    }

    for (const report of pendingReports) {
      void this.report(report);
    }
  }

  debug(report: ApplicationReportInput): void {
    void this.report(createApplicationReport('debug', report));
  }

  info(report: ApplicationReportInput): void {
    void this.report(createApplicationReport('info', report));
  }

  warning(report: ApplicationReportInput): void {
    void this.report(createApplicationReport('warning', report));
  }

  error(report: ApplicationErrorReportInput): void {
    void this.report(createApplicationReport('error', report));
  }

  report(report: ApplicationReport): Promise<void> {
    if (this.handlers.length === 0) {
      if (!this.active) {
        this.pendingReports.push(report);
      }

      fallbackReport(report);
      return Promise.resolve();
    }

    const delivery = this.dispatch(report);

    this.deliveries.add(delivery);
    void delivery.finally(() => this.deliveries.delete(delivery));

    return delivery;
  }

  async dispose(): Promise<void> {
    await Promise.allSettled(this.deliveries);

    const results = await Promise.allSettled(
      this.handlers.map((handler) => {
        return Promise.resolve().then(() => handler.dispose?.());
      }),
    );

    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        fallbackReportHandlerFailure(result.reason, this.handlers[index]!, 'dispose');
      }
    }
  }

  private async dispatch(report: ApplicationReport): Promise<void> {
    const results = await Promise.allSettled(
      this.handlers.map((handler) => {
        return Promise.resolve().then(() => handler.report(report));
      }),
    );

    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        fallbackReportHandlerFailure(result.reason, this.handlers[index]!, 'report', report);
      }
    }
  }
}

const fallbackReport = (report: ApplicationReport): void => {
  const method: Record<ApplicationReportLevel, 'debug' | 'error' | 'info' | 'warn'> = {
    debug: 'debug',
    error: 'error',
    info: 'info',
    warning: 'warn',
  };

  globalThis.console[method[report.level]](report);
};

const fallbackReportHandlerFailure = (
  cause: unknown,
  handler: ApplicationReportHandlerInterface,
  operation: 'dispose' | 'report',
  report?: ApplicationReport,
): void => {
  globalThis.console.error({
    applicationReportId: report?.id,
    cause,
    failedApplicationReportHandler: handler.constructor.name,
    operation,
  });
};
