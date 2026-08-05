import { describe, expect, it, vi } from 'vitest';

import type { NormalizedRuntimeErrorReport } from '../runtime-error-report';
import { RuntimeErrorReporterSinkInterface } from '../runtime-error-reporter-sink';

import { normalizeRuntimeErrorReport, RuntimeErrorReporter } from './runtime-error-reporter.ts';

describe('RuntimeErrorReporter', () => {
  it('normalizes report severity and routing fields by code', () => {
    const report = normalizeRuntimeErrorReport({
      code: 'revalidate.handler.failed',
      error: new Error('Revalidate завершился с ошибкой.'),
    });

    expect(report).toMatchObject({
      code: 'revalidate.handler.failed',
      phase: 'revalidate',
      severity: 'warning',
      source: 'revalidate.handler',
    });
  });

  it('allows explicit severity override', () => {
    const report = normalizeRuntimeErrorReport({
      code: 'revalidate.handler.failed',
      error: new Error('Revalidate завершился с ошибкой.'),
      severity: 'error',
    });

    expect(report.severity).toBe('error');
  });

  it('normalizes module provider phase reports', () => {
    const report = normalizeRuntimeErrorReport({
      code: 'route.module.provider_before_render_failed',
      error: new Error('Provider завершился с ошибкой.'),
    });

    expect(report).toMatchObject({
      code: 'route.module.provider_before_render_failed',
      phase: 'route.module.provider.before_render',
      severity: 'error',
      source: 'route.module.provider',
    });
  });

  it('normalizes application event handler reports', () => {
    const report = normalizeRuntimeErrorReport({
      code: 'application.event.handler_failed',
      error: new Error('Event handler завершился с ошибкой.'),
    });

    expect(report).toMatchObject({
      code: 'application.event.handler_failed',
      phase: 'application.event',
      severity: 'warning',
      source: 'application.event',
    });
  });

  it('keeps reporting best-effort when one sink fails', async () => {
    const failedSink = new TestRuntimeErrorReporterSink(() => {
      throw new Error('Sink завершился с ошибкой.');
    });
    const workingSink = new TestRuntimeErrorReporterSink();
    const reporter = new RuntimeErrorReporter([failedSink, workingSink]);

    await reporter.report({
      code: 'application.initializer.failed',
      error: new Error('Initialize завершился с ошибкой.'),
    });

    expect(failedSink.reportMock).toHaveBeenCalledTimes(1);
    expect(workingSink.reportMock).toHaveBeenCalledTimes(1);
    expect(workingSink.reportMock.mock.calls[0]?.[0]).toMatchObject({
      code: 'application.initializer.failed',
      phase: 'application.initialize',
      severity: 'critical',
      source: 'application.initializer',
    });
  });
});

class TestRuntimeErrorReporterSink extends RuntimeErrorReporterSinkInterface {
  readonly reportMock;

  constructor(handler: (report: NormalizedRuntimeErrorReport) => void | Promise<void> = () => {}) {
    super();
    this.reportMock = vi.fn((report: NormalizedRuntimeErrorReport) => handler(report));
  }

  report(report: NormalizedRuntimeErrorReport): void | Promise<void> {
    return this.reportMock(report);
  }
}
