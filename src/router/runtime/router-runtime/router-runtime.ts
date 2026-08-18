import type { FrameRouter } from '../../../frame/router/declaration';
import { matchFrameRouter, type FrameRouterMatch } from '../../../frame/router/matching';
import { FrameRouterRuntime } from '../../../frame/router/runtime';
import type { FrameRouterRuntimeLoadOptions } from '../../../frame/router/runtime';
import { FrameRouterRuntimeRegistry } from '../../../frame/router/runtime/frame-router-runtime-registry/frame-router-runtime-registry';
import type { RuntimeScope } from '../../../runtime/scope/base';

export type RouteRuntimeId = string;

export interface RouteRuntimeHandle {
  commit(): void;
  discardPending(): void;
  dispose(): Promise<void>;
  getRouteScope(): RuntimeScope;
}

export interface RouteRuntimeRegistrationOptions {
  readonly frames?: readonly FrameRouter[];
}

interface RouteActivationTracker {
  activate(): void;
  complete(): void;
}

export interface ActiveFrameRouterRuntime {
  readonly kind: 'router';
  readonly match: FrameRouterMatch;
  readonly ownerScope: RuntimeScope;
  readonly preparedRuntime: FrameRouterRuntime;
  readonly runtimeKey: RouteRuntimeId;
}

export interface MatchedFrameRoute {
  readonly match: FrameRouterMatch;
  readonly routeId: RouteRuntimeId;
}

interface ResolvedActiveFrameRouterRuntime extends Omit<ActiveFrameRouterRuntime, 'preparedRuntime'> {}

export type RouterRuntimeListener = () => void;

export class RouterRuntime {
  private readonly activeRouteIds = new Set<RouteRuntimeId>();
  private readonly frameRouterRuntimes = new FrameRouterRuntimeRegistry();
  private readonly invalidatedRouteIds = new Set<RouteRuntimeId>();
  private readonly listeners = new Set<RouterRuntimeListener>();
  private readonly routeFrames = new Map<RouteRuntimeId, readonly FrameRouter[]>();
  private readonly routeRuntimes = new Map<RouteRuntimeId, RouteRuntimeHandle>();
  private readonly routeActivationWaves = new Map<string, Map<RouteRuntimeId, RouteActivationBarrier>>();

  get(routeId: RouteRuntimeId): RouteRuntimeHandle {
    const routeRuntime = this.routeRuntimes.get(routeId);

    if (!routeRuntime) {
      throw new Error(`Runtime маршрута не зарегистрирован: ${routeId}.`);
    }

    return routeRuntime;
  }

  matchFrameRoute(routeIds: readonly RouteRuntimeId[], hash: string): MatchedFrameRoute | null {
    let activeFrameRoute: MatchedFrameRoute | null = null;

    for (const routeId of routeIds) {
      for (const frameRouter of this.routeFrames.get(routeId) ?? []) {
        const match = matchFrameRouter(frameRouter, hash);

        if (match) {
          activeFrameRoute = {
            match,
            routeId,
          };
        }
      }
    }

    return activeFrameRoute;
  }

  resolveActiveFrame(routeIds: readonly RouteRuntimeId[], hash: string): ActiveFrameRouterRuntime | null {
    const activeFrameRouter = this.resolveFrame(routeIds, hash);

    const activeRuntimeKeys = new Map<FrameRouter, string>();

    if (activeFrameRouter) {
      activeRuntimeKeys.set(activeFrameRouter.match.router, activeFrameRouter.runtimeKey);
    }

    this.disposeInactiveFrameRouterRuntimes(activeRuntimeKeys);

    if (!activeFrameRouter) {
      return null;
    }

    return {
      ...activeFrameRouter,
      preparedRuntime: this.frameRouterRuntimes.prepare(
        activeFrameRouter.match.router,
        activeFrameRouter.runtimeKey,
        activeFrameRouter.ownerScope,
      ),
    };
  }

  async preloadFrame(
    routeIds: readonly RouteRuntimeId[],
    hash: string,
    options: FrameRouterRuntimeLoadOptions,
  ): Promise<void> {
    if (!(await this.waitForRouteActivation(routeIds, options.location.key, options.signal))) {
      return;
    }

    const activeFrameRouter = this.resolveFrame(routeIds, hash);

    if (!activeFrameRouter) {
      return;
    }

    const runtime = this.frameRouterRuntimes.prepare(
      activeFrameRouter.match.router,
      activeFrameRouter.runtimeKey,
      activeFrameRouter.ownerScope,
    );

    await runtime.load(activeFrameRouter.match, options);
  }

  invalidateActiveRoutes(): void {
    const hadActiveRoutes = this.activeRouteIds.size > 0;

    this.activeRouteIds.forEach((routeId) => this.invalidatedRouteIds.add(routeId));
    this.activeRouteIds.clear();

    if (hadActiveRoutes) {
      this.notifyListeners();
    }

    void this.disposeFrameRouterRuntimes();
  }

  register(
    routeId: RouteRuntimeId,
    routeRuntime: RouteRuntimeHandle,
    options: RouteRuntimeRegistrationOptions = {},
  ): void {
    if (this.routeRuntimes.has(routeId)) {
      throw new Error(`Runtime маршрута уже зарегистрирован: ${routeId}.`);
    }

    this.routeFrames.set(routeId, options.frames ?? []);
    this.routeRuntimes.set(routeId, routeRuntime);
  }

  trackRouteActivation(routeId: RouteRuntimeId, navigationKey: string): RouteActivationTracker {
    const barrier = this.getOrCreateRouteActivationBarrier(routeId, navigationKey);
    let activated = false;

    return {
      activate: () => {
        activated = true;
        barrier.resolve(true);
      },
      complete: () => {
        if (!activated) {
          barrier.resolve(false);
        }
      },
    };
  }

  subscribe(listener: RouterRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    const routeRuntimes = [...this.routeRuntimes.values()];
    const frameRouterRuntimes = this.frameRouterRuntimes.drain();

    this.activeRouteIds.clear();
    this.invalidatedRouteIds.clear();
    this.routeFrames.clear();
    this.routeRuntimes.clear();
    this.routeActivationWaves.clear();
    this.notifyListeners();

    await Promise.all([
      ...routeRuntimes.map((runtime) => runtime.dispose()),
      ...frameRouterRuntimes.map((runtime) => runtime.dispose()),
    ]);
  }

  private resolveFrame(routeIds: readonly RouteRuntimeId[], hash: string): ResolvedActiveFrameRouterRuntime | null {
    const activeFrameRoute = this.matchFrameRoute(routeIds, hash);

    if (!activeFrameRoute) {
      return null;
    }

    const routeRuntime = this.routeRuntimes.get(activeFrameRoute.routeId);

    if (!routeRuntime) {
      return null;
    }

    return {
      kind: 'router',
      match: activeFrameRoute.match,
      ownerScope: routeRuntime.getRouteScope(),
      runtimeKey: activeFrameRoute.routeId,
    };
  }

  private getOrCreateRouteActivationBarrier(routeId: RouteRuntimeId, navigationKey: string): RouteActivationBarrier {
    let wave = this.routeActivationWaves.get(navigationKey);

    if (!wave) {
      wave = new Map();
      this.routeActivationWaves.set(navigationKey, wave);
    }

    let barrier = wave.get(routeId);

    if (!barrier) {
      barrier = new RouteActivationBarrier();
      wave.set(routeId, barrier);
    }

    return barrier;
  }

  private async waitForRouteActivation(
    routeIds: readonly RouteRuntimeId[],
    navigationKey: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    await Promise.resolve();

    if (signal?.aborted) {
      this.routeActivationWaves.delete(navigationKey);
      return false;
    }

    const wave = this.routeActivationWaves.get(navigationKey);
    const barriers = routeIds.flatMap((routeId) => {
      const barrier = wave?.get(routeId);
      return barrier ? [barrier] : [];
    });

    if (barriers.length === 0) {
      this.routeActivationWaves.delete(navigationKey);
      return !signal?.aborted;
    }

    const activation = Promise.all(barriers.map((barrier) => barrier.promise)).then((results) => {
      return results.every(Boolean);
    });
    const result = signal ? await waitForActivation(activation, signal) : await activation;

    this.routeActivationWaves.delete(navigationKey);

    return result;
  }

  syncActiveRoutes(routeIds: readonly RouteRuntimeId[]): void {
    const nextActiveRouteIds = new Set(routeIds.filter((routeId) => this.routeRuntimes.has(routeId)));
    const changed = !areRouteIdSetsEqual(this.activeRouteIds, nextActiveRouteIds);

    nextActiveRouteIds.forEach((routeId) => {
      this.routeRuntimes.get(routeId)?.commit();
      this.invalidatedRouteIds.delete(routeId);
    });

    this.routeRuntimes.forEach((routeRuntime, routeId) => {
      if (nextActiveRouteIds.has(routeId)) {
        return;
      }

      routeRuntime.discardPending();

      if (this.activeRouteIds.has(routeId) || this.invalidatedRouteIds.has(routeId)) {
        this.invalidatedRouteIds.delete(routeId);
        void routeRuntime.dispose();
      }
    });

    this.activeRouteIds.clear();
    nextActiveRouteIds.forEach((routeId) => this.activeRouteIds.add(routeId));

    if (changed) {
      this.notifyListeners();
    }
  }

  private disposeInactiveFrameRouterRuntimes(activeRuntimeKeys: ReadonlyMap<FrameRouter, string>): void {
    this.disposeRuntimesAfterRender(this.frameRouterRuntimes.collectInactiveExcept(activeRuntimeKeys));
  }

  private async disposeFrameRouterRuntimes(): Promise<void> {
    await Promise.all(this.frameRouterRuntimes.drain().map((runtime) => runtime.dispose()));
  }

  private disposeRuntimesAfterRender(runtimes: readonly FrameRouterRuntime[]): void {
    if (runtimes.length === 0) {
      return;
    }

    queueMicrotask(() => {
      void Promise.allSettled(runtimes.map((runtime) => runtime.dispose()));
    });
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

const areRouteIdSetsEqual = (left: ReadonlySet<RouteRuntimeId>, right: ReadonlySet<RouteRuntimeId>): boolean => {
  if (left.size !== right.size) {
    return false;
  }

  for (const routeId of left) {
    if (!right.has(routeId)) {
      return false;
    }
  }

  return true;
};

class RouteActivationBarrier {
  readonly promise: Promise<boolean>;
  private settle!: (activated: boolean) => void;
  private settled = false;

  constructor() {
    this.promise = new Promise<boolean>((resolve) => {
      this.settle = resolve;
    });
  }

  resolve(activated: boolean): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.settle(activated);
  }
}

const waitForActivation = (activation: Promise<boolean>, signal: AbortSignal): Promise<boolean> => {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const abort = (): void => resolve(false);

    signal.addEventListener('abort', abort, { once: true });
    void activation.then((activated) => {
      signal.removeEventListener('abort', abort);
      resolve(activated);
    });
  });
};
