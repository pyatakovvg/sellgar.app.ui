import { getRouteDefinition } from '../../../../core/router/declaration/route';
import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeHrefCapabilityInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
  RouterBridgeLocationInterface,
} from '../../../../core/router/bridge/router-bridge';
import type { NavigationRouterState, NavigationState } from '../../../../core/router/runtime/navigation-state';

import { parseWebQuery, serializeWebQuery, type WebQueryParseOptions } from './web-query-codec.ts';

export interface WebRouterBridgeOptions extends WebQueryParseOptions {
  readonly basePath?: string;
}

interface WebHistoryMetadata {
  readonly entryId: string | undefined;
  readonly index: number;
  readonly revalidate: boolean;
  readonly state: unknown;
}

interface BrowserSnapshot {
  readonly historyState: unknown;
  readonly index: number;
  readonly url: string;
}

interface PendingHistoryTraversal {
  readonly promise: Promise<void>;
  readonly reject: (error: unknown) => void;
  readonly resolve: () => void;
}

interface PendingHistoryRollback {
  readonly previous: BrowserSnapshot;
  readonly resolve: () => void;
}

export const createWebRouterBridge = (
  options: WebRouterBridgeOptions = {},
): RouterBridgeInterface & RouterBridgeHrefCapabilityInterface => {
  return new WebRouterBridge(options);
};

class WebRouterBridge implements RouterBridgeInterface, RouterBridgeHrefCapabilityInterface {
  readonly runtimeRetention = 'release' as const;

  private readonly basePath: string;
  private readonly queryOptions: WebQueryParseOptions;

  private context: RouterBridgeInitializeContextInterface | null = null;
  private currentIndex = 0;
  private disposed = false;
  private lastCommitted: BrowserSnapshot | null = null;
  private navigationApi: Navigation | null = null;
  private pendingRollback: PendingHistoryRollback | null = null;
  private pendingTraversal: PendingHistoryTraversal | null = null;
  private precommittedDestination: string | null = null;
  private revision = 0;

  constructor(options: WebRouterBridgeOptions) {
    this.basePath = normalizeBasePath(options.basePath);
    this.queryOptions = Object.freeze({
      arraySeparator: options.arraySeparator,
      enableTypeConversion: options.enableTypeConversion,
      parseArrays: options.parseArrays,
      parseObjects: options.parseObjects,
    });
  }

  back(): Promise<void> {
    if (this.pendingTraversal) {
      return this.pendingTraversal.promise;
    }

    const browser = getBrowserWindow();

    if (this.currentIndex <= 0) {
      browser.history.back();
      return Promise.resolve();
    }

    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });

    this.pendingTraversal = { promise, reject, resolve };

    try {
      browser.history.back();
    } catch (error) {
      this.pendingTraversal = null;
      reject(error);
    }

    return promise;
  }

  createHref(navigation: NavigationState): string {
    return createNavigationUrl(navigation, this.basePath);
  }

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    if (this.context) {
      throw new Error('Web RouterBridge уже инициализирован.');
    }

    const browser = getBrowserWindow();
    const metadata = readHistoryMetadata(browser.history.state);

    this.context = context;
    this.disposed = false;
    this.currentIndex = metadata?.index ?? 0;

    try {
      if (!metadata) {
        browser.history.replaceState(
          createHistoryState(browser.history.state, this.currentIndex, true),
          '',
          getCurrentRelativeUrl(browser),
        );
      }

      this.lastCommitted = createBrowserSnapshot(browser, this.currentIndex);
      browser.addEventListener('beforeunload', this.handleBeforeUnload);
      browser.addEventListener('popstate', this.handlePopState);
      this.navigationApi = resolveNavigationApi(browser);
      this.navigationApi?.addEventListener('navigate', this.handleNavigation);
      context.signal.addEventListener('abort', this.handleInitializationAbort, { once: true });
      await context.restore(this.readLocation(browser), { blockersConfirmed: false });
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  commit(navigation: NavigationState, context: RouterBridgeCommitContextInterface): void {
    if (context.signal.aborted) {
      return;
    }

    const browser = getBrowserWindow();

    if (context.source === 'external') {
      const metadata = readHistoryMetadata(browser.history.state);

      this.currentIndex = metadata?.index ?? this.currentIndex;
      const resolvedUrl =
        navigation.boundary === null && navigation.replace
          ? createExternalResolvedUrl(navigation, this.basePath, browser.location.hash)
          : getCurrentRelativeUrl(browser);

      browser.history.replaceState(
        createHistoryState(navigation.state, this.currentIndex, navigation.revalidation !== null, context.history.id),
        '',
        resolvedUrl,
      );

      this.lastCommitted = createBrowserSnapshot(browser, this.currentIndex);
      return;
    }

    const url = createNavigationUrl(navigation, this.basePath);
    const replace = context.history.action !== 'push';
    const index = replace ? this.currentIndex : this.currentIndex + 1;
    const state = createHistoryState(navigation.state, index, navigation.revalidation !== null, context.history.id);

    if (replace) {
      browser.history.replaceState(state, '', url);
    } else {
      browser.history.pushState(state, '', url);
    }

    this.currentIndex = index;
    this.lastCommitted = createBrowserSnapshot(browser, index);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.revision += 1;
    this.pendingTraversal?.resolve();
    this.pendingTraversal = null;
    this.pendingRollback?.resolve();
    this.pendingRollback = null;
    this.precommittedDestination = null;
    const browser = getOptionalBrowserWindow();

    browser?.removeEventListener('beforeunload', this.handleBeforeUnload);
    browser?.removeEventListener('popstate', this.handlePopState);
    this.navigationApi?.removeEventListener('navigate', this.handleNavigation);
    this.navigationApi = null;
    this.context?.signal.removeEventListener('abort', this.handleInitializationAbort);
    this.context = null;
  }

  private readonly handleInitializationAbort = (): void => {
    this.dispose();
  };

  private readonly handleNavigation = (event: Event): void => {
    const navigationEvent = event as NavigateEvent;
    const context = this.context;

    this.precommittedDestination = null;

    if (!context || this.disposed || !canInterceptTraversal(navigationEvent)) {
      return;
    }

    const destination = new URL(navigationEvent.destination.url);

    try {
      navigationEvent.intercept({
        handler: () => undefined,
        precommitHandler: async () => {
          const confirmed = await context.confirm(this.readLocationFromUrl(destination), navigationEvent.signal);

          if (!confirmed || navigationEvent.signal.aborted) {
            throw createNavigationAbortError();
          }

          this.precommittedDestination = destination.href;
        },
      });
    } catch {
      return;
    }
  };

  private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.context?.shouldBlockUnload()) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  };

  private readonly handlePopState = (): void => {
    const rollback = this.pendingRollback;

    if (rollback) {
      this.pendingRollback = null;
      this.currentIndex = rollback.previous.index;
      this.lastCommitted = createBrowserSnapshot(getBrowserWindow(), rollback.previous.index);
      rollback.resolve();
      return;
    }

    const revision = ++this.revision;
    const blockersConfirmed = this.consumePrecommittedDestination(getBrowserWindow());

    void this.restoreBrowserLocation(revision, blockersConfirmed).then(
      (handled) => {
        if (handled) {
          this.settlePendingTraversal();
        }
      },
      (error: unknown) => {
        if (!this.settlePendingTraversal(error)) {
          globalThis.console.error(error);
        }
      },
    );
  };

  private settlePendingTraversal(error?: unknown): boolean {
    const pending = this.pendingTraversal;

    if (!pending) {
      return false;
    }

    this.pendingTraversal = null;

    if (error === undefined) {
      pending.resolve();
    } else {
      pending.reject(error);
    }

    return true;
  }

  private async restoreBrowserLocation(revision: number, blockersConfirmed: boolean): Promise<boolean> {
    const browser = getBrowserWindow();
    const context = this.context;
    const previous = this.lastCommitted;

    if (!context || this.disposed) {
      return false;
    }

    try {
      const committed = await context.restore(this.readLocation(browser), { blockersConfirmed });

      if (revision !== this.revision || this.disposed) {
        return false;
      }

      if (!committed) {
        if (previous) {
          await this.rollbackHistory(browser, previous);
        }

        return true;
      }

      const metadata = readHistoryMetadata(browser.history.state);

      this.currentIndex = metadata?.index ?? this.currentIndex;
      this.lastCommitted = createBrowserSnapshot(browser, this.currentIndex);
      return true;
    } catch (error) {
      if (revision === this.revision && previous && !this.disposed) {
        await this.rollbackHistory(browser, previous);
      }

      throw error;
    }
  }

  private rollbackHistory(browser: Window, previous: BrowserSnapshot): Promise<void> {
    const metadata = readHistoryMetadata(browser.history.state);
    const delta = metadata ? previous.index - metadata.index : 0;

    if (delta === 0) {
      browser.history.replaceState(previous.historyState, '', previous.url);
      this.currentIndex = previous.index;
      this.lastCommitted = createBrowserSnapshot(browser, previous.index);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.pendingRollback = { previous, resolve };
      browser.history.go(delta);
    });
  }

  private readLocation(browser: Window): RouterBridgeLocationInterface {
    const metadata = readHistoryMetadata(browser.history.state);
    const nested = parseHashLocation(browser.location.hash, this.queryOptions);

    return Object.freeze({
      address: decodeAddress(removeBasePath(browser.location.pathname, this.basePath)),
      ...(metadata?.entryId ? { entryId: metadata.entryId } : {}),
      nested,
      query: parseWebQuery(browser.location.search, this.queryOptions),
      revalidate: metadata?.revalidate ?? true,
      state: metadata ? metadata.state : browser.history.state,
    });
  }

  private consumePrecommittedDestination(browser: Window): boolean {
    const destination = this.precommittedDestination;

    this.precommittedDestination = null;
    return destination !== null && destination === browser.location.href;
  }

  private readLocationFromUrl(url: URL): RouterBridgeLocationInterface {
    return Object.freeze({
      address: decodeAddress(removeBasePath(url.pathname, this.basePath)),
      nested: parseHashLocation(url.hash, this.queryOptions),
      query: parseWebQuery(url.search, this.queryOptions),
      revalidate: true,
      state: undefined,
    });
  }
}

const canInterceptTraversal = (event: NavigateEvent): boolean => {
  return (
    event.navigationType === 'traverse' && event.canIntercept && event.cancelable && event.destination.sameDocument
  );
};

const resolveNavigationApi = (browser: Window): Navigation | null => {
  if (!('navigation' in browser) || typeof NavigationPrecommitController === 'undefined') {
    return null;
  }

  return browser.navigation;
};

const createNavigationAbortError = (): DOMException => {
  return new DOMException('Navigation was cancelled.', 'AbortError');
};

const createNavigationUrl = (navigation: NavigationState, basePath: string): string => {
  const rootAddress = encodeRouterState(navigation.root);
  const nestedAddress: string[] = [];
  let child = navigation.root.child;

  while (child) {
    nestedAddress.push(...encodeRouterState(child));
    child = child.child;
  }

  const pathname = joinPath(basePath, rootAddress);
  const search = serializeWebQuery(navigation.root.query);
  const nestedQuery = getDeepestRouterState(navigation.root.child)?.query ?? EMPTY_QUERY;
  const serializedNestedQuery = serializeWebQuery(nestedQuery);
  const hash =
    nestedAddress.length > 0
      ? `#${nestedAddress.join('/')}${serializedNestedQuery.length > 0 ? `?${serializedNestedQuery}` : ''}`
      : '';

  return `${pathname}${search.length > 0 ? `?${search}` : ''}${hash}`;
};

const getDeepestRouterState = (state: NavigationRouterState | null): NavigationRouterState | null => {
  let current = state;
  while (current?.child) current = current.child;
  return current;
};

const parseHashLocation = (
  hash: string,
  queryOptions: WebQueryParseOptions,
): RouterBridgeLocationInterface['nested'] => {
  const value = hash.replace(/^#/, '');
  if (value.length === 0) return null;

  const queryIndex = value.indexOf('?');
  const address = queryIndex < 0 ? value : value.slice(0, queryIndex);
  const query = queryIndex < 0 ? '' : value.slice(queryIndex + 1);

  return Object.freeze({
    address: decodeAddress(address),
    query: parseWebQuery(query, queryOptions),
  });
};

const EMPTY_QUERY = Object.freeze({});

const createExternalResolvedUrl = (navigation: NavigationState, basePath: string, currentHash: string): string => {
  const resolved = createNavigationUrl(navigation, basePath);

  if (navigation.root.child !== null || currentHash.length === 0 || resolved.includes('#')) {
    return resolved;
  }

  return `${resolved}${currentHash}`;
};

const encodeRouterState = (state: NavigationRouterState): string[] => {
  return state.path.flatMap((entry) => {
    const segments = getRouteDefinition(entry.route).address?.segments ?? [];

    return segments.map((segment) => {
      const value = typeof segment === 'string' ? segment : entry.params[segment.name];

      if (value === null || value === undefined) {
        throw new Error('Navigation Route param нельзя сериализовать в URL.');
      }

      return encodeURIComponent(String(value));
    });
  });
};

const decodeAddress = (value: string): readonly string[] => {
  const normalized = value.replace(/^\/+/, '').replace(/\/+$/, '');

  if (normalized.length === 0) {
    return Object.freeze([]);
  }

  return Object.freeze(
    normalized.split('/').map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    }),
  );
};

const normalizeBasePath = (value: string | undefined): string => {
  const normalized = `/${value ?? ''}`.replace(/\/+/g, '/').replace(/\/$/, '');

  return normalized === '' ? '/' : normalized;
};

const removeBasePath = (pathname: string, basePath: string): string => {
  if (basePath === '/') {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
};

const joinPath = (basePath: string, encodedSegments: readonly string[]): string => {
  const suffix = encodedSegments.join('/');

  if (basePath === '/') {
    return suffix.length > 0 ? `/${suffix}` : '/';
  }

  return suffix.length > 0 ? `${basePath}/${suffix}` : basePath;
};

const createHistoryState = (
  state: unknown,
  index: number,
  revalidate: boolean,
  entryId?: string,
): Readonly<Record<string, WebHistoryMetadata>> => {
  return Object.freeze({
    [HISTORY_STATE_KEY]: Object.freeze({ entryId, index, revalidate, state }),
  });
};

const readHistoryMetadata = (state: unknown): WebHistoryMetadata | null => {
  if (!isRecord(state)) {
    return null;
  }

  const metadata = state[HISTORY_STATE_KEY];

  if (!isRecord(metadata) || typeof metadata.index !== 'number' || typeof metadata.revalidate !== 'boolean') {
    return null;
  }

  return {
    entryId: typeof metadata.entryId === 'string' ? metadata.entryId : undefined,
    index: metadata.index,
    revalidate: metadata.revalidate,
    state: metadata.state,
  };
};

const createBrowserSnapshot = (browser: Window, index: number): BrowserSnapshot => {
  return Object.freeze({
    historyState: browser.history.state,
    index,
    url: getCurrentRelativeUrl(browser),
  });
};

const getCurrentRelativeUrl = (browser: Window): string => {
  return `${browser.location.pathname}${browser.location.search}${browser.location.hash}`;
};

const getBrowserWindow = (): Window => {
  const browser = getOptionalBrowserWindow();

  if (!browser) {
    throw new Error('Web RouterBridge требует browser Window.');
  }

  return browser;
};

const getOptionalBrowserWindow = (): Window | null => {
  return typeof globalThis.window === 'undefined' ? null : globalThis.window;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const HISTORY_STATE_KEY = '__sellgar_app__';
