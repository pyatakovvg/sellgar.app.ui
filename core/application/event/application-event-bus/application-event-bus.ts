import { DisposableRegistryInterface } from '../../disposable/disposable-registry';
import { Inject, Injectable } from '../../../di/injection/decorators';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { reportRuntimeFailure, RuntimeFailureReporterInterface } from '../../../runtime/failure/runtime-failure';
import { executeRuntimeOperation } from '../../../runtime/operation/runtime-operation';

import type {
  ApplicationEventHandlerDeclaration,
  ApplicationEventScope,
  ApplicationEventSubscription,
  ApplicationEventToken,
} from '../application-event';

import { ApplicationEventBusInterface } from './application-event-bus.interface.ts';

type ApplicationEventSubscriptionSet = Set<ApplicationEventHandlerDeclaration<object>>;

@Injectable()
export class ApplicationEventBus extends ApplicationEventBusInterface {
  private readonly subscriptions = new Map<ApplicationEventToken<object>, ApplicationEventSubscriptionSet>();

  constructor(
    @Inject(RuntimeFailureReporterInterface)
    private readonly reporter: RuntimeFailureReporterInterface,
    @Inject(DisposableRegistryInterface) disposables: DisposableRegistryInterface,
  ) {
    super();
    disposables.add(this);
  }

  clear(): void {
    this.subscriptions.clear();
  }

  createScope(): ApplicationEventScope {
    return new ApplicationEventBusScope(this);
  }

  dispose(): void {
    this.clear();
  }

  async publish<TEvent extends object>(eventToken: ApplicationEventToken<TEvent>, event: TEvent): Promise<void> {
    const subscriptions = this.subscriptions.get(eventToken as ApplicationEventToken<object>);

    if (!subscriptions) {
      return;
    }

    await Promise.all(
      [...subscriptions].map(async (handler) => {
        const owner = { kind: 'application' } as const;
        const result = await executeRuntimeOperation({
          guard: null,
          operation: () => executeHandler(handler as ApplicationEventHandlerDeclaration<TEvent>, event),
          source: {
            operation: 'handle',
            owner,
            participant: {
              kind: 'event-handler',
              token: getEventHandlerToken(handler),
            },
          },
        });

        if (result.type === 'failed' || result.type === 'escalated') {
          await reportRuntimeFailure(this.reporter, result.failure, owner, 'event-handler.contained', 'ready');
        }
      }),
    );
  }

  subscribe<TEvent extends object>(
    eventToken: ApplicationEventToken<TEvent>,
    handler: ApplicationEventHandlerDeclaration<TEvent>,
  ): ApplicationEventSubscription {
    const subscriptionToken = eventToken as ApplicationEventToken<object>;
    const subscriptionHandler = handler as ApplicationEventHandlerDeclaration<object>;
    let subscriptions = this.subscriptions.get(subscriptionToken);

    if (!subscriptions) {
      subscriptions = new Set<ApplicationEventHandlerDeclaration<object>>();
      this.subscriptions.set(subscriptionToken, subscriptions);
    }

    subscriptions.add(subscriptionHandler);

    return {
      dispose: () => {
        subscriptions.delete(subscriptionHandler);

        if (subscriptions.size === 0) {
          this.subscriptions.delete(subscriptionToken);
        }
      },
    };
  }
}

class ApplicationEventBusScope implements ApplicationEventScope {
  private readonly subscriptions = new Set<ApplicationEventSubscription>();
  private disposed = false;

  constructor(private readonly bus: ApplicationEventBusInterface) {}

  subscribe<TEvent extends object>(
    eventToken: ApplicationEventToken<TEvent>,
    handler: ApplicationEventHandlerDeclaration<TEvent>,
  ): this {
    this.assertActive();
    this.subscriptions.add(this.bus.subscribe(eventToken, handler));

    return this;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const subscriptions = [...this.subscriptions].reverse();

    this.subscriptions.clear();

    for (const subscription of subscriptions) {
      subscription.dispose();
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Event scope приложения уже освобожден.');
    }
  }
}

const executeHandler = <TEvent extends object>(
  handler: ApplicationEventHandlerDeclaration<TEvent>,
  event: TEvent,
): void | Promise<void> => {
  if (typeof handler === 'function') {
    return handler(event);
  }

  return handler.handle(event);
};

const getEventHandlerToken = (handler: ApplicationEventHandlerDeclaration<object>): DependencyToken<unknown> => {
  if (typeof handler === 'function') {
    return handler as unknown as DependencyToken<unknown>;
  }

  return handler.constructor as DependencyToken<unknown>;
};
