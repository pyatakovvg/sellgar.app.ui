import type {
  ApplicationEventHandlerDeclaration,
  ApplicationEventScope,
  ApplicationEventSubscription,
  ApplicationEventToken,
} from '../application-event';

export abstract class ApplicationEventBusInterface {
  abstract createScope(): ApplicationEventScope;

  abstract publish<TEvent extends object>(eventToken: ApplicationEventToken<TEvent>, event: TEvent): Promise<void>;

  abstract subscribe<TEvent extends object>(
    eventToken: ApplicationEventToken<TEvent>,
    handler: ApplicationEventHandlerDeclaration<TEvent>,
  ): ApplicationEventSubscription;
}
