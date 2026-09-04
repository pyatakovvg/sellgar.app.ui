import type { NavigationState } from '../navigation-state';
import type { RouteActivationRuntime } from '../route-runtime';
import type { RouterRuntimeActivation } from './router-runtime.ts';

export interface RouterRuntimePreparedTransition<TPresentation = unknown> {
  readonly navigation: NavigationState;

  commit(): Promise<RouterRuntimeActivation<TPresentation>>;

  complete(context: RouterRuntimeTransitionCompletionContext): Promise<void>;

  discard(): Promise<void>;

  getRouteRuntimes(): readonly RouteActivationRuntime<TPresentation>[];

  publish(): void;
}

export interface RouterRuntimeTransitionCompletionContext {
  readonly signal: AbortSignal;
}

interface PreparedRouterTransitionOptions<TPresentation> {
  readonly commit: () => Promise<RouterRuntimeActivation<TPresentation>>;
  readonly complete: (context: RouterRuntimeTransitionCompletionContext) => Promise<void>;
  readonly discard: () => Promise<void>;
  readonly getRouteRuntimes: () => readonly RouteActivationRuntime<TPresentation>[];
  readonly navigation: NavigationState;
  readonly publish: () => void;
}

export class PreparedRouterTransition<TPresentation> implements RouterRuntimePreparedTransition<TPresentation> {
  readonly navigation: NavigationState;
  private settlement: Promise<unknown> | null = null;
  private completion: Promise<void> | null = null;
  private published = false;
  private state: 'pending' | 'committed' | 'discarded' = 'pending';

  constructor(private readonly options: PreparedRouterTransitionOptions<TPresentation>) {
    this.navigation = options.navigation;
  }

  commit(): Promise<RouterRuntimeActivation<TPresentation>> {
    if (this.state === 'committed') {
      return this.settlement as Promise<RouterRuntimeActivation<TPresentation>>;
    }

    if (this.state === 'discarded') {
      return Promise.reject(new Error('Подготовленный router transition уже отменён.'));
    }

    this.state = 'committed';
    this.settlement = this.options.commit();

    return this.settlement as Promise<RouterRuntimeActivation<TPresentation>>;
  }

  complete(context: RouterRuntimeTransitionCompletionContext): Promise<void> {
    if (this.state !== 'committed') {
      return Promise.reject(new Error('Завершить можно только зафиксированный router transition.'));
    }

    if (!this.published) {
      return Promise.reject(new Error('Завершить можно только опубликованный router transition.'));
    }

    this.completion ??= (this.settlement ?? Promise.resolve()).then(() => this.options.complete(context));

    return this.completion;
  }

  discard(): Promise<void> {
    if (this.state === 'discarded') {
      return (this.settlement ?? Promise.resolve()).then(() => undefined);
    }

    if (this.state === 'committed') {
      return Promise.reject(new Error('Подготовленный router transition уже зафиксирован.'));
    }

    this.state = 'discarded';
    this.settlement = this.options.discard();

    return this.settlement.then(() => undefined);
  }

  getRouteRuntimes(): readonly RouteActivationRuntime<TPresentation>[] {
    return this.options.getRouteRuntimes();
  }

  publish(): void {
    if (this.state !== 'committed') {
      throw new Error('Опубликовать можно только зафиксированный router transition.');
    }

    if (this.published) return;

    this.published = true;
    this.options.publish();
  }
}
