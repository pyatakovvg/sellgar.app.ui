import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeFailureReporterInterface, type RuntimeFailureReport } from '../../../runtime/failure';

import { ApplicationEventHandlerInterface } from '../application-event';

import { ApplicationEventBusBindings } from './application-event-bus.bindings.ts';
import { ApplicationEventBusInterface } from './application-event-bus.interface.ts';
import { ApplicationEventBus } from './application-event-bus.ts';

describe('ApplicationEventBus', () => {
  it('publishes abstract class events to function and class handlers', async () => {
    const reporter = new TestRuntimeFailureReporter();
    const bus = new ApplicationEventBus(reporter);
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
    const reporter = new TestRuntimeFailureReporter();
    const bus = new ApplicationEventBus(reporter);
    const handler = vi.fn(async () => {
      await Promise.resolve();
    });

    bus.subscribe(ProfileResolvedEvent, handler);

    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('disposes subscriptions', async () => {
    const reporter = new TestRuntimeFailureReporter();
    const bus = new ApplicationEventBus(reporter);
    const handler = vi.fn();
    const subscription = bus.subscribe(ProfileResolvedEvent, handler);

    subscription.dispose();
    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('clears subscriptions on dispose', async () => {
    const reporter = new TestRuntimeFailureReporter();
    const bus = new ApplicationEventBus(reporter);
    const handler = vi.fn();

    bus.subscribe(ProfileResolvedEvent, handler);
    bus.dispose();
    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('disposes scoped subscriptions together', async () => {
    const reporter = new TestRuntimeFailureReporter();
    const bus = new ApplicationEventBus(reporter);
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const scope = bus
      .createScope()
      .subscribe(ProfileResolvedEvent, firstHandler)
      .subscribe(ProfileResolvedEvent, secondHandler);

    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'));

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);

    scope.dispose();
    scope.dispose();

    await bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:2'));

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects new subscriptions in disposed scopes', () => {
    const reporter = new TestRuntimeFailureReporter();
    const bus = new ApplicationEventBus(reporter);
    const scope = bus.createScope();
    const handler = vi.fn<(event: ProfileResolvedEvent) => void>();

    scope.dispose();

    expect(() => scope.subscribe(ProfileResolvedEvent, handler)).toThrow('Event scope приложения уже освобожден.');
  });

  it('reports handler errors and keeps broadcast best-effort', async () => {
    const error = new Error('Handler завершился с ошибкой.');
    const reporter = new TestRuntimeFailureReporter();
    const bus = new ApplicationEventBus(reporter);
    const failedHandler = vi.fn(() => {
      throw error;
    });
    const workingHandler = vi.fn();

    bus.subscribe(ProfileResolvedEvent, failedHandler);
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

  it('keeps publish best-effort when reporter fails', async () => {
    const reporter = new TestRuntimeFailureReporter(() => {
      throw new Error('Reporter завершился с ошибкой.');
    });
    const bus = new ApplicationEventBus(reporter);

    bus.subscribe(ProfileResolvedEvent, () => {
      throw new Error('Handler завершился с ошибкой.');
    });

    await expect(bus.publish(ProfileResolvedEvent, createProfileResolvedEvent('profile:1'))).resolves.toBeUndefined();
  });

  it('binds event bus as application singleton', () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationEventBusOwner);

    const firstBus = scope.get(ApplicationEventBusInterface);
    const secondBus = scope.get(ApplicationEventBusInterface);

    expect(firstBus).toBe(secondBus);
  });
});

abstract class ProfileResolvedEvent {
  declare readonly profileId: string;
}

const createProfileResolvedEvent = (profileId: string): ProfileResolvedEvent => {
  return { profileId };
};

class TestApplicationEventHandler extends ApplicationEventHandlerInterface<ProfileResolvedEvent> {
  readonly handleMock = vi.fn();

  handle(event: ProfileResolvedEvent): void {
    this.handleMock(event);
  }
}

class TestRuntimeFailureReporter extends RuntimeFailureReporterInterface {
  readonly reportMock;

  constructor(handler: (report: RuntimeFailureReport) => void | Promise<void> = () => {}) {
    super();
    this.reportMock = vi.fn((report: RuntimeFailureReport) => handler(report));
  }

  report(report: RuntimeFailureReport): void | Promise<void> {
    return this.reportMock(report);
  }
}

@Injectable()
@UseBindings(ApplicationEventBusBindings)
class TestApplicationEventBusOwner {}
