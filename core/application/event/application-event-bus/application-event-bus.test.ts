import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { DisposableRegistry } from '../../disposable/disposable-registry';
import { Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import { RuntimeFailureReporterInterface } from '../../../runtime/failure/runtime-failure';
import type { RuntimeFailureReport } from '../../../runtime/failure/runtime-failure';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { ApplicationEventHandlerInterface } from '../application-event';

import { ApplicationEventBusBindings } from './application-event-bus.bindings.ts';
import { ApplicationEventBusInterface } from './application-event-bus.interface.ts';
import { ApplicationEventBus } from './application-event-bus.ts';

describe('ApplicationEventBus', () => {
  it('publishes abstract class events to function and class handlers', async () => {
    const { bus, reporter } = createBus();
    const functionHandler = vi.fn();
    const classHandler = new TestApplicationEventHandler();

    bus.subscribe(ProfileResolvedEvent, functionHandler);
    bus.subscribe(ProfileResolvedEvent, classHandler);

    const event = createProfileResolvedEvent('profile:1');

    await bus.publish(ProfileResolvedEvent, event);

    expect(functionHandler).toHaveBeenCalledWith(event);
    expect(classHandler.handleMock).toHaveBeenCalledWith(event);
    expect(reporter.reportMock).not.toHaveBeenCalled();
  });

  it('waits for async handlers', async () => {
    const { bus } = createBus();
    let completed = false;

    bus.subscribe(ProfileResolvedEvent, async () => {
      await Promise.resolve();
      completed = true;
    });

    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(completed).toBe(true);
  });

  it('disposes individual subscriptions', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    const subscription = bus.subscribe(ProfileResolvedEvent, handler);

    subscription.dispose();
    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('disposes grouped subscriptions in reverse registration order', () => {
    const { bus } = createBus();
    const disposeOrder: string[] = [];
    const firstSubscription = { dispose: () => disposeOrder.push('first') };
    const secondSubscription = { dispose: () => disposeOrder.push('second') };

    vi.spyOn(bus, 'subscribe').mockReturnValueOnce(firstSubscription).mockReturnValueOnce(secondSubscription);

    const scope = bus.createScope().subscribe(ProfileResolvedEvent, vi.fn()).subscribe(ProfileResolvedEvent, vi.fn());

    scope.dispose();
    scope.dispose();

    expect(disposeOrder).toEqual(['second', 'first']);
  });

  it('rejects new subscriptions in disposed scopes', () => {
    const { bus } = createBus();
    const scope = bus.createScope();

    scope.dispose();

    expect(() => scope.subscribe(ProfileResolvedEvent, vi.fn())).toThrow('Event scope приложения уже освобожден.');
  });

  it('reports handler errors and keeps broadcast best-effort', async () => {
    const error = new Error('Handler завершился с ошибкой.');
    const { bus, reporter } = createBus();
    const workingHandler = vi.fn();

    bus.subscribe(ProfileResolvedEvent, () => {
      throw error;
    });
    bus.subscribe(ProfileResolvedEvent, workingHandler);

    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(workingHandler).toHaveBeenCalledTimes(1);
    expect(reporter.reportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'event-handler.contained',
        failure: expect.objectContaining({
          cause: error,
          source: expect.objectContaining({
            operation: 'handle',
            participant: expect.objectContaining({ kind: 'event-handler' }),
          }),
        }),
        ownerState: 'ready',
      }),
    );
  });

  it('keeps publish best-effort when the failure reporter fails', async () => {
    const consoleError = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const { bus } = createBus(() => {
      throw new Error('Reporter завершился с ошибкой.');
    });

    bus.subscribe(ProfileResolvedEvent, () => {
      throw new Error('Handler завершился с ошибкой.');
    });

    await expect(bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'))).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ failedRuntimeFailureReporter: true }));

    consoleError.mockRestore();
  });

  it('clears subscriptions through application disposables', async () => {
    const disposables = new DisposableRegistry();
    const bus = new ApplicationEventBus(new TestRuntimeFailureReporter(), disposables);
    const handler = vi.fn();

    bus.subscribe(ProfileResolvedEvent, handler);

    await disposables.dispose();
    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('binds the bus as an application singleton', () => {
    const scope = new ApplicationScope();

    scope.bindDisposables(new DisposableRegistry());
    scope.activate(TestApplicationEventBusOwner);

    expect(scope.get(ApplicationEventBusInterface)).toBe(scope.get(ApplicationEventBusInterface));
  });
});

abstract class ProfileResolvedEvent {
  declare readonly profileId: string;
}

const createProfileResolvedEvent = (profileId: string): ProfileResolvedEvent => {
  return { profileId };
};

class TestApplicationEventHandler implements ApplicationEventHandlerInterface<ProfileResolvedEvent> {
  readonly handleMock = vi.fn();

  handle(event: ProfileResolvedEvent): void {
    this.handleMock(event);
  }
}

class TestRuntimeFailureReporter implements RuntimeFailureReporterInterface {
  readonly reportMock;

  constructor(handler: (report: RuntimeFailureReport) => void | Promise<void> = () => undefined) {
    this.reportMock = vi.fn((report: RuntimeFailureReport) => handler(report));
  }

  report(report: RuntimeFailureReport): void | Promise<void> {
    return this.reportMock(report);
  }
}

const createBus = (
  report: (report: RuntimeFailureReport) => void | Promise<void> = () => undefined,
): {
  readonly bus: ApplicationEventBus;
  readonly reporter: TestRuntimeFailureReporter;
} => {
  const reporter = new TestRuntimeFailureReporter(report);

  return {
    bus: new ApplicationEventBus(reporter, new DisposableRegistry()),
    reporter,
  };
};

@Injectable()
@UseBindings(ApplicationEventBusBindings)
class TestApplicationEventBusOwner {}
