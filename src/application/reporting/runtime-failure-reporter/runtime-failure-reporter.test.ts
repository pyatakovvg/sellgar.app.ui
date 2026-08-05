import { describe, expect, it, vi } from 'vitest';

import {
  createRuntimeFailure,
  createRuntimeFailureReport,
  RuntimeFailureSinkInterface,
  type RuntimeFailureReport,
} from '../../../runtime/failure';

import { RuntimeFailureReporter } from './runtime-failure-reporter.ts';

describe('RuntimeFailureReporter', () => {
  it('fans out one structured report to every sink', async () => {
    const firstSink = new TestRuntimeFailureSink();
    const secondSink = new TestRuntimeFailureSink();
    const reporter = new RuntimeFailureReporter([firstSink, secondSink]);
    const report = createTestReport();

    await reporter.report(report);

    expect(firstSink.reportMock).toHaveBeenCalledWith(report);
    expect(secondSink.reportMock).toHaveBeenCalledWith(report);
  });

  it('does not let a failing sink affect reporting or other sinks', async () => {
    const sinkError = new Error('Failure sink failed.');
    const failedSink = new TestRuntimeFailureSink(() => {
      throw sinkError;
    });
    const workingSink = new TestRuntimeFailureSink();
    const reporter = new RuntimeFailureReporter([failedSink, workingSink]);
    const report = createTestReport();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(reporter.report(report)).resolves.toBeUndefined();

      expect(workingSink.reportMock).toHaveBeenCalledWith(report);
      expect(consoleError).toHaveBeenCalledWith({
        cause: sinkError,
        failedRuntimeFailureSink: true,
        runtimeFailureId: report.failure.id,
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

class TestRuntimeFailureSink extends RuntimeFailureSinkInterface {
  readonly reportMock;

  constructor(handler: (report: RuntimeFailureReport) => void | Promise<void> = () => {}) {
    super();
    this.reportMock = vi.fn((report: RuntimeFailureReport) => handler(report));
  }

  report(report: RuntimeFailureReport): void | Promise<void> {
    return this.reportMock(report);
  }
}

const createTestReport = (): RuntimeFailureReport => {
  const owner = { kind: 'application' } as const;
  const failure = createRuntimeFailure(new Error('Application failed.'), {
    operation: 'initialize',
    owner,
    participant: { kind: 'runtime' },
  });

  return createRuntimeFailureReport(failure, owner, 'application.activation-failed', 'failed');
};
