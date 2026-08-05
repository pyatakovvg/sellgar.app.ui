export type ApplicationEventToken<TEvent extends object> = abstract new (...args: never[]) => TEvent;

export type ApplicationEventHandler<TEvent extends object> = (event: TEvent) => void | Promise<void>;

export type ApplicationEventHandlerDeclaration<TEvent extends object> =
  ApplicationEventHandler<TEvent> | ApplicationEventHandlerInterface<TEvent>;

export interface ApplicationEventSubscription {
  dispose(): void;
}

export interface ApplicationEventScope {
  subscribe<TEvent extends object>(
    eventToken: ApplicationEventToken<TEvent>,
    handler: ApplicationEventHandlerDeclaration<TEvent>,
  ): this;

  dispose(): void;
}

export abstract class ApplicationEventHandlerInterface<TEvent extends object> {
  abstract handle(event: TEvent): void | Promise<void>;
}
