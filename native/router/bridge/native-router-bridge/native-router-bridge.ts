import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeHistoryAction,
  RouterBridgeHistoryEntryInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
  RouterBridgeLocationInterface,
} from '../../../../core/router/bridge/router-bridge';
import { getRouteDefinition } from '../../../../core/router/declaration/route';
import type { NavigationRouterState, NavigationState } from '../../../../core/router/runtime/navigation-state';
import { createNativeLinkingTransport } from '../../transport/native-linking-transport';
import type { NativeRouterTransportInterface } from '../../transport/native-router-transport';

export interface NativeNavigationDriver {
  rootBack(): void | Promise<void>;
}

export interface NativeRouterBridgeOptions {
  readonly transport?: NativeRouterTransportInterface;
}

export interface NativeNavigationEntry {
  readonly id: string;
  readonly location: RouterBridgeLocationInterface;
}

export interface NativeNavigationSnapshot {
  readonly action: RouterBridgeHistoryAction | null;
  readonly backInProgress: boolean;
  readonly entries: readonly NativeNavigationEntry[];
  readonly index: number;
}

type NativeNavigationListener = () => void;

interface NativePresentationCompletion {
  readonly navigation: NavigationState;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly revision: number;
}

const EMPTY_SNAPSHOT: NativeNavigationSnapshot = Object.freeze({
  action: null,
  backInProgress: false,
  entries: Object.freeze([]),
  index: -1,
});

export class NativeRouterBridge implements RouterBridgeInterface {
  readonly runtimeRetention = 'retain' as const;

  private context: RouterBridgeInitializeContextInterface | null = null;
  private driver: NativeNavigationDriver | null = null;
  private readonly listeners = new Set<NativeNavigationListener>();
  private pendingPresentation: NativePresentationCompletion | null = null;
  private presentedNavigation: NavigationState | undefined;
  private presentationRevision = 0;
  private snapshot = EMPTY_SNAPSHOT;
  private readonly transport: NativeRouterTransportInterface;
  private unsubscribeTransport: (() => void) | null = null;

  constructor(options: NativeRouterBridgeOptions) {
    this.transport = options.transport ?? createNativeLinkingTransport();
  }

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    if (this.context) {
      throw new Error('Native RouterBridge уже инициализирован.');
    }

    this.context = context;
    this.unsubscribeTransport = this.transport.subscribe(this.handleExternalLocation);
    context.signal.addEventListener('abort', this.handleInitializationAbort, { once: true });

    try {
      const initialLocation = await this.transport.getInitialLocation(context.signal);

      if (context.signal.aborted) return;

      if (initialLocation) {
        await context.restore(initialLocation, { blockersConfirmed: false });
      } else {
        await context.navigate.root();
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  async commit(navigation: NavigationState, context: RouterBridgeCommitContextInterface): Promise<void> {
    if (context.signal.aborted) return;

    const completion = this.createPresentationCompletion(navigation, context.signal);

    this.setSnapshot(projectCommit(this.snapshot, navigation, context.history));

    if (!completion) {
      this.presentedNavigation = navigation;
      return;
    }

    await completion.promise;
  }

  async back(): Promise<void> {
    const context = this.requireContext();

    if (context.cancelNavigation()) return;

    this.setBackInProgress(true);

    try {
      const handled = await context.back();

      if (!handled) await this.driver?.rootBack();
    } finally {
      this.setBackInProgress(false);
    }
  }

  cancelPendingNavigation(): boolean {
    return this.context?.cancelNavigation() ?? false;
  }

  confirm(location: RouterBridgeLocationInterface, signal: AbortSignal): Promise<boolean> {
    return this.requireContext().confirm(location, signal);
  }

  getSnapshot = (): NativeNavigationSnapshot => {
    return this.snapshot;
  };

  getPendingPresentationRevision(): number | null {
    return this.pendingPresentation?.revision ?? null;
  }

  getPresentedNavigation(): NavigationState | undefined {
    return this.presentedNavigation;
  }

  completePresentation(revision: number): void {
    if (this.pendingPresentation?.revision === revision) {
      this.presentedNavigation = this.pendingPresentation.navigation;
      this.pendingPresentation.resolve();
    }
  }

  async restore(location: RouterBridgeLocationInterface, blockersConfirmed = false): Promise<boolean> {
    const previous = this.snapshot;
    const traversed = location.entryId ? projectTraversal(previous, location.entryId) : null;

    if (traversed) this.setSnapshot(traversed);

    try {
      const restored = await this.requireContext().restore(location, { blockersConfirmed });

      if (!restored && traversed) this.setSnapshot(previous);
      return restored;
    } catch (error) {
      if (traversed) this.setSnapshot(previous);
      throw error;
    }
  }

  registerDriver(driver: NativeNavigationDriver): () => void {
    if (this.driver && this.driver !== driver) {
      throw new Error('Native router bridge уже подключён к navigation host.');
    }

    this.driver = driver;

    return () => {
      if (this.driver === driver) this.driver = null;
    };
  }

  subscribe = (listener: NativeNavigationListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  toLocation(navigation: NavigationState): RouterBridgeLocationInterface {
    return createBridgeLocation(navigation);
  }

  dispose(): void {
    this.pendingPresentation?.resolve();
    this.pendingPresentation = null;
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    this.context?.signal.removeEventListener('abort', this.handleInitializationAbort);
    this.context = null;
    this.driver = null;
    this.listeners.clear();
    this.presentedNavigation = undefined;
    this.snapshot = EMPTY_SNAPSHOT;
  }

  private readonly handleExternalLocation = (location: RouterBridgeLocationInterface): void => {
    void this.restore(location).catch(() => undefined);
  };

  private readonly handleInitializationAbort = (): void => {
    this.dispose();
  };

  private setSnapshot(snapshot: NativeNavigationSnapshot): void {
    if (snapshot === this.snapshot) return;

    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private createPresentationCompletion(
    navigation: NavigationState,
    signal: AbortSignal,
  ): NativePresentationCompletion | null {
    this.pendingPresentation?.resolve();
    this.pendingPresentation = null;
    this.presentationRevision += 1;

    if (!this.driver || signal.aborted) return null;

    const revision = this.presentationRevision;
    let settled = false;
    let resolvePromise!: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    const complete = (): void => {
      if (settled) return;

      settled = true;
      signal.removeEventListener('abort', complete);

      if (this.pendingPresentation?.revision === revision) {
        this.pendingPresentation = null;
      }

      resolvePromise();
    };
    const completion = Object.freeze({ navigation, promise, resolve: complete, revision });

    this.pendingPresentation = completion;
    signal.addEventListener('abort', complete, { once: true });

    return completion;
  }

  private setBackInProgress(backInProgress: boolean): void {
    if (this.snapshot.backInProgress === backInProgress) return;

    this.setSnapshot(Object.freeze({ ...this.snapshot, backInProgress }));
  }

  private requireContext(): RouterBridgeInitializeContextInterface {
    if (!this.context) {
      throw new Error('Native router bridge ещё не инициализирован.');
    }

    return this.context;
  }
}

export const createNativeRouterBridge = (options: NativeRouterBridgeOptions = {}): NativeRouterBridge => {
  return new NativeRouterBridge(options);
};

const createBridgeLocation = (navigation: NavigationState): RouterBridgeLocationInterface => {
  const nestedAddress: string[] = [];
  let child = navigation.root.child;

  while (child) {
    nestedAddress.push(...encodeRouterState(child));
    child = child.child;
  }

  const deepest = getDeepestRouterState(navigation.root.child);

  return Object.freeze({
    address: Object.freeze(encodeRouterState(navigation.root)),
    nested:
      nestedAddress.length > 0
        ? Object.freeze({ address: Object.freeze(nestedAddress), query: deepest?.query ?? EMPTY_QUERY })
        : null,
    query: navigation.root.query,
    revalidate: navigation.revalidation !== null,
    state: navigation.state,
  });
};

const projectCommit = (
  snapshot: NativeNavigationSnapshot,
  navigation: NavigationState,
  history: RouterBridgeHistoryEntryInterface,
): NativeNavigationSnapshot => {
  const entry = createNativeNavigationEntry(history.id, navigation);
  let entries: readonly NativeNavigationEntry[];

  switch (history.action) {
    case 'reset':
      entries = [entry];
      break;
    case 'pop':
    case 'replace':
    case 'update':
      entries = [...snapshot.entries.slice(0, history.index), entry];
      break;
    case 'push':
      entries = [...snapshot.entries.slice(0, history.index), entry];
      break;
  }

  if (entries.length !== history.length || history.index !== history.length - 1) {
    throw new Error('Core history commit нельзя спроецировать в native transport history.');
  }

  return Object.freeze({
    action: history.action,
    backInProgress: snapshot.backInProgress,
    entries: Object.freeze(entries),
    index: history.index,
  });
};

const projectTraversal = (snapshot: NativeNavigationSnapshot, entryId: string): NativeNavigationSnapshot | null => {
  const index = snapshot.entries.findIndex((entry) => entry.id === entryId);

  if (index < 0 || index === snapshot.index) return null;
  return Object.freeze({
    action: 'pop',
    backInProgress: snapshot.backInProgress,
    entries: Object.freeze(snapshot.entries.slice(0, index + 1)),
    index,
  });
};

const createNativeNavigationEntry = (id: string, navigation: NavigationState): NativeNavigationEntry => {
  return Object.freeze({
    id,
    location: Object.freeze({ ...createBridgeLocation(navigation), entryId: id }),
  });
};

const encodeRouterState = (state: NavigationRouterState): string[] => {
  return state.path.flatMap((entry) => {
    const segments = getRouteDefinition(entry.route).address?.segments ?? [];

    return segments.map((segment) => {
      const value = typeof segment === 'string' ? segment : entry.params[segment.name];

      if (value === null || value === undefined) {
        throw new Error('Navigation Route param нельзя сериализовать в native navigation state.');
      }

      return String(value);
    });
  });
};

const getDeepestRouterState = (state: NavigationRouterState | null): NavigationRouterState | null => {
  let current = state;

  while (current?.child) current = current.child;

  return current;
};

const EMPTY_QUERY = Object.freeze({});
