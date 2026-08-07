import { describe, expect, it, vi } from 'vitest';

import { RuntimeFailureReporterInterface, type RuntimeFailureReport } from '../../../runtime/failure';

import { RevalidateService } from './';

describe('RevalidateService', () => {
  it('runs registered keyed handlers by key', async () => {
    const fixture = createFixture();
    const handler = vi.fn();
    const fallback = vi.fn();

    fixture.service.register(ProfileController, handler);
    fixture.service.registerFallback(fallback);

    await fixture.service.revalidate(ProfileController);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('runs fallback handlers when keyed handlers are missing', async () => {
    const fixture = createFixture();
    const fallback = vi.fn();

    fixture.service.registerFallback(fallback);

    await fixture.service.revalidate(MissingController);

    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('runs every keyed handler when key is not provided', async () => {
    const fixture = createFixture();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const fallback = vi.fn();

    fixture.service.register(FirstController, firstHandler);
    fixture.service.register(SecondController, secondHandler);
    fixture.service.registerFallback(fallback);

    await fixture.service.revalidate();

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('runs fallback handlers when revalidate has no keyed handlers', async () => {
    const fixture = createFixture();
    const fallback = vi.fn();

    fixture.service.registerFallback(fallback);

    await fixture.service.revalidate();

    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('unregisters keyed handlers', async () => {
    const fixture = createFixture();
    const handler = vi.fn();
    const fallback = vi.fn();

    fixture.service.register(ProfileController, handler);
    fixture.service.registerFallback(fallback);
    fixture.service.unregister(ProfileController, handler);

    await fixture.service.revalidate(ProfileController);

    expect(handler).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('unregisters fallback handlers', async () => {
    const fixture = createFixture();
    const fallback = vi.fn();

    fixture.service.registerFallback(fallback);
    fixture.service.unregisterFallback(fallback);

    await fixture.service.revalidate();

    expect(fallback).not.toHaveBeenCalled();
  });

  it('reports rejected handlers without rejecting revalidate', async () => {
    const fixture = createFixture();
    const error = new Error('Revalidate завершился с ошибкой.');

    fixture.service.register(ProfileController, () => {
      throw error;
    });

    await expect(fixture.service.revalidate(ProfileController)).resolves.toBeUndefined();

    expect(fixture.reporter.reportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'revalidate.failed',
        failure: expect.objectContaining({
          cause: error,
          source: expect.objectContaining({
            operation: 'revalidate',
            participant: expect.objectContaining({ kind: 'revalidate-handler' }),
          }),
        }),
        ownerState: 'ready',
      }),
    );
  });

  it('does not start handlers when revalidate is already aborted', async () => {
    const fixture = createFixture();
    const handler = vi.fn();
    const controller = new AbortController();

    fixture.service.register(ProfileController, handler);
    controller.abort();

    await fixture.service.revalidate(ProfileController, { signal: controller.signal });

    expect(handler).not.toHaveBeenCalled();
    expect(fixture.reporter.reportMock).not.toHaveBeenCalled();
  });
});

interface Fixture {
  readonly reporter: TestRuntimeFailureReporter;
  readonly service: RevalidateService;
}

const createFixture = (): Fixture => {
  const reporter = new TestRuntimeFailureReporter();

  return {
    reporter,
    service: new RevalidateService(reporter),
  };
};

class TestRuntimeFailureReporter extends RuntimeFailureReporterInterface {
  readonly reportMock = vi.fn();

  report(report: RuntimeFailureReport): void {
    this.reportMock(report);
  }
}

class FirstController {}

class MissingController {}

class ProfileController {}

class SecondController {}
