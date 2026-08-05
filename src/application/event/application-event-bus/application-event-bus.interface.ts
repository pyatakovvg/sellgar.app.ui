import type {
  ApplicationEventHandlerDeclaration,
  ApplicationEventScope,
  ApplicationEventSubscription,
  ApplicationEventToken,
} from '../application-event';

export abstract class ApplicationEventBusInterface {
  abstract clear(): void;

  abstract dispose(): void;

  abstract publish<TEvent extends object>(eventToken: ApplicationEventToken<TEvent>, event: TEvent): Promise<void>;

  abstract createScope(): ApplicationEventScope;

  abstract subscribe<TEvent extends object>(
    eventToken: ApplicationEventToken<TEvent>,
    handler: ApplicationEventHandlerDeclaration<TEvent>,
  ): ApplicationEventSubscription;
}
