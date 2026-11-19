import { describe, expect, it, vi } from 'vitest';

import type { ApplicationReport, ApplicationReportHandlerInterface } from '../application-report';

import type { RuntimeContextInterface } from '../../../runtime/context/runtime-context';
import { SessionRuntimeState } from '../../session/session-runtime-state';

import { ApplicationReporter } from './application-reporter.ts';

const context: RuntimeContextInterface = {
  app: {
    lifecycle: { exception: null, phase: 'ready' },
    location: null,
    subscribe: () => () => undefined,
    subscribeLocation: () => () => undefined,
  },
  session: new SessionRuntimeState(),
  signal: new AbortController().signal,
};

const report: ApplicationReport = {
  event: 'test.event',
  id: 'application-report:1',
  level: 'info',
  reportedAt: 1,
};

class TestReportHandler implements ApplicationReportHandlerInterface {
  readonly dispose = vi.fn(() => Promise.resolve());
  readonly report = vi.fn(() => Promise.resolve());
}

describe('ApplicationReporter', () => {
  it('owns report fan-out and handler disposal', async () => {
    const first = new TestReportHandler();
    const second = new TestReportHandler();
    const reporter = new ApplicationReporter();

    reporter.activate([first, second], context);
    await reporter.report(report);
    await reporter.dispose();

    expect(first.report).toHaveBeenCalledWith(report, context);
    expect(second.report).toHaveBeenCalledWith(report, context);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it.each(['debug', 'info', 'warning', 'error'] as const)('creates structured %s reports', async (level) => {
    const handler = new TestReportHandler();
    const reporter = new ApplicationReporter();

    reporter.activate([handler], context);
    reporter[level]({ event: `test.${level}`, message: 'Test report' });

    await vi.waitFor(() => {
      expect(handler.report).toHaveBeenCalledWith(
        expect.objectContaining({
          event: `test.${level}`,
          id: expect.stringMatching(/^application-report:/),
          level,
          message: 'Test report',
          reportedAt: expect.any(Number),
        }),
        context,
      );
    });
  });

  it('contains a failed handler without interrupting another handler', async () => {
    const fallback = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const failed = new TestReportHandler();
    const healthy = new TestReportHandler();

    failed.report.mockRejectedValueOnce(new Error('Reporter failed'));

    const reporter = new ApplicationReporter();

    reporter.activate([failed, healthy], context);
    await reporter.report(report);

    expect(healthy.report).toHaveBeenCalledWith(report, context);
    expect(fallback).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationReportId: 'application-report:1',
        failedApplicationReportHandler: 'TestReportHandler',
        operation: 'report',
      }),
    );
  });

  it('buffers reports until handlers are activated', async () => {
    const fallback = vi.spyOn(globalThis.console, 'info').mockImplementation(() => undefined);
    const handler = new TestReportHandler();
    const reporter = new ApplicationReporter();

    await reporter.report(report);
    reporter.activate([handler], context);

    await vi.waitFor(() => expect(handler.report).toHaveBeenCalledWith(report, context));
    expect(fallback).toHaveBeenCalledWith(report);
  });
});
