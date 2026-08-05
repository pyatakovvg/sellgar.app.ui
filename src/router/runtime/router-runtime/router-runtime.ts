import type React from 'react';

import { RouterFrameAvailabilityInterface } from '../router-frame-availability';
import { getFrameMetadata } from '../../../frame/declaration/frame';
import { FrameRuntime } from '../../../frame/runtime/frame-runtime';
import { clearFrameNavigationState } from '../../../frame/navigation/frame-navigation-state';
import { getUseBindingsMetadata } from '../../../di/composition/use-bindings';

import type { FrameConstructor, FrameMetadata } from '../../../frame/declaration/frame';
import type { FrameSourceCloseHandler, FrameSourceContextInterface } from '../../../frame/source/frame-source';
import type { RuntimeScope } from '../../../runtime/scope/base';
import { FrameRuntimeRegistry } from '../frame-runtime-registry';

export type RouteRuntimeId = string;

export interface RouteRuntimeHandle {
  commit(): void;
  discardPending(): void;
  dispose(): Promise<void>;
  getPreparedFrameRuntime<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
  ): FrameRuntime<TProps> | null;
  prepareFrameRuntime<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
    props: TProps,
    ownerScope: RuntimeScope,
  ): FrameRuntime<TProps>;
  getRuntimeScope(): RuntimeScope;
}

export interface RouteRuntimeRegistrationOptions {
  readonly exception?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly frames?: readonly FrameConstructor[];
  readonly resolveException?: () => React.ReactNode;
}

export interface ActiveFrameRuntime<TProps extends object = object> {
  readonly back: FrameSourceCloseHandler;
  readonly close: FrameSourceCloseHandler;
  readonly exception?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly frame: FrameConstructor<TProps>;
  readonly ownerScope: RuntimeScope;
  readonly preparedRuntime: FrameRuntime<TProps> | null;
  readonly props: TProps;
  readonly runtimeKey?: string;
}

interface ResolvedActiveFrameRuntime<TProps extends object = object> extends Omit<
  ActiveFrameRuntime<TProps>,
  'preparedRuntime'
> {
  readonly metadata: FrameMetadata<TProps>;
  readonly routeRuntime: RouteRuntimeHandle;
}

const shouldUseFrameRuntime = (frame: FrameConstructor, metadata: FrameMetadata): boolean => {
  return (
    (metadata.canActivate?.length ?? 0) > 0 ||
    getUseBindingsMetadata(frame).length > 0 ||
    (metadata.layouts?.length ?? 0) > 0 ||
    (metadata.providers?.length ?? 0) > 0
  );
};

export type RouterRuntimeListener = () => void;

export class RouterRuntime extends RouterFrameAvailabilityInterface {
  private readonly frameRuntimes = new FrameRuntimeRegistry();
  private readonly routeExceptions = new Map<RouteRuntimeId, React.ReactNode>();
  private readonly routeExceptionResolvers = new Map<RouteRuntimeId, () => React.ReactNode>();
  private readonly routeForbidden = new Map<RouteRuntimeId, React.ReactNode>();
  private readonly routeFrames = new Map<RouteRuntimeId, readonly FrameConstructor[]>();
  private readonly routeRuntimes = new Map<RouteRuntimeId, RouteRuntimeHandle>();
  private readonly activeRouteIds = new Set<RouteRuntimeId>();
  private readonly invalidatedRouteIds = new Set<RouteRuntimeId>();
  private readonly listeners = new Set<RouterRuntimeListener>();
  private routeLoadingCounter = 0;
  private frameNavigationScope: string | undefined;

  get(routeId: RouteRuntimeId): RouteRuntimeHandle {
    const routeRuntime = this.routeRuntimes.get(routeId);

    if (!routeRuntime) {
      throw new Error(`Runtime маршрута не зарегистрирован: ${routeId}.`);
    }

    return routeRuntime;
  }

  getPreparedFrameRuntime<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
  ): FrameRuntime<TProps> | null {
    return this.frameRuntimes.getPrepared(frame, runtimeKey);
  }

  prepareFrameRuntime<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
    props: TProps,
    ownerScope: RuntimeScope,
  ): FrameRuntime<TProps> {
    return this.frameRuntimes.prepare(frame, runtimeKey, props, ownerScope);
  }

  getActiveFrames(): readonly FrameConstructor[] {
    const activeFrames = new Set<FrameConstructor>();

    for (const routeId of this.activeRouteIds) {
      const routeFrames = this.routeFrames.get(routeId) ?? [];

      for (const frame of routeFrames) {
        activeFrames.add(frame);
      }
    }

    return [...activeFrames];
  }

  getFrameNavigationScope(): string | undefined {
    return this.frameNavigationScope;
  }

  setFrameNavigationScope(scope: string | undefined): void {
    this.frameNavigationScope = scope;
  }

  hasActiveFrame(frame: FrameConstructor): boolean {
    for (const routeId of this.activeRouteIds) {
      const routeFrames = this.routeFrames.get(routeId) ?? [];

      if (routeFrames.includes(frame)) {
        return true;
      }
    }

    return false;
  }

  isRouteLoading(): boolean {
    return this.routeLoadingCounter > 0;
  }

  resolveActiveFrames(context: FrameSourceContextInterface): readonly ActiveFrameRuntime[] {
    let activeFrame: ResolvedActiveFrameRuntime | null = null;

    for (const routeId of this.activeRouteIds) {
      const routeFrames = this.routeFrames.get(routeId) ?? [];
      const routeRuntime = this.get(routeId);
      const ownerScope = routeRuntime.getRuntimeScope();

      for (const frame of routeFrames) {
        const metadata = getFrameMetadata(frame);
        const source = metadata.source;

        if (!source) {
          continue;
        }

        const result = source.resolve(context);

        if (!result.active) {
          continue;
        }

        activeFrame = {
          back: result.close,
          close: () => {
            clearFrameNavigationState(this.frameNavigationScope);
            return result.close();
          },
          exception: this.resolveRouteException(routeId),
          forbidden: this.routeForbidden.get(routeId),
          frame,
          ownerScope,
          metadata,
          routeRuntime,
          props: result.props,
          runtimeKey: result.runtimeKey,
        };
      }
    }

    const activeFrames = new Map<FrameConstructor, ResolvedActiveFrameRuntime>();

    if (activeFrame) {
      activeFrames.set(activeFrame.frame, activeFrame);
    }

    if (activeFrame || !context.location.hash) {
      this.disposeInactiveFrameRuntimes(activeFrames);
    }

    return [...activeFrames.values()].map((activeFrame) => {
      return {
        back: activeFrame.back,
        close: activeFrame.close,
        exception: activeFrame.exception,
        forbidden: activeFrame.forbidden,
        frame: activeFrame.frame,
        ownerScope: activeFrame.ownerScope,
        preparedRuntime: shouldUseFrameRuntime(activeFrame.frame, activeFrame.metadata)
          ? this.prepareFrameRuntime(
              activeFrame.frame,
              activeFrame.runtimeKey,
              activeFrame.props,
              activeFrame.ownerScope,
            )
          : null,
        props: activeFrame.props,
        runtimeKey: activeFrame.runtimeKey,
      };
    });
  }

  invalidateActiveRoutes(): void {
    clearFrameNavigationState(this.frameNavigationScope);

    const hadActiveRoutes = this.activeRouteIds.size > 0;

    this.activeRouteIds.forEach((routeId) => {
      this.invalidatedRouteIds.add(routeId);
    });
    this.activeRouteIds.clear();

    if (hadActiveRoutes) {
      this.notifyListeners();
    }

    void this.disposeFrameRuntimes();
  }

  register(
    routeId: RouteRuntimeId,
    routeRuntime: RouteRuntimeHandle,
    options: RouteRuntimeRegistrationOptions = {},
  ): void {
    if (this.routeRuntimes.has(routeId)) {
      throw new Error(`Runtime маршрута уже зарегистрирован: ${routeId}.`);
    }

    this.routeExceptions.set(routeId, options.exception);
    this.routeForbidden.set(routeId, options.forbidden);

    if (options.resolveException) {
      this.routeExceptionResolvers.set(routeId, options.resolveException);
    }

    this.routeFrames.set(routeId, options.frames ?? []);
    this.routeRuntimes.set(routeId, routeRuntime);
  }

  subscribe(listener: RouterRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  trackRouteLoading(): () => void {
    this.routeLoadingCounter += 1;
    this.notifyListeners();

    let isCompleted = false;

    return () => {
      if (isCompleted) {
        return;
      }

      isCompleted = true;
      this.routeLoadingCounter = Math.max(0, this.routeLoadingCounter - 1);
      this.notifyListeners();
    };
  }

  async dispose(): Promise<void> {
    const routeRuntimes = [...this.routeRuntimes.values()];
    const frameRuntimes = this.frameRuntimes.drain();

    this.activeRouteIds.clear();
    this.invalidatedRouteIds.clear();
    this.routeLoadingCounter = 0;
    this.routeExceptions.clear();
    this.routeExceptionResolvers.clear();
    this.routeFrames.clear();
    this.routeRuntimes.clear();
    this.notifyListeners();

    await Promise.all([
      ...routeRuntimes.map((routeRuntime) => {
        return routeRuntime.dispose();
      }),
      ...frameRuntimes.map((frameRuntime) => {
        return frameRuntime.dispose();
      }),
    ]);
  }

  syncActiveRoutes(routeIds: readonly RouteRuntimeId[]): void {
    const nextActiveRouteIds = new Set(
      routeIds.filter((routeId) => {
        return this.routeRuntimes.has(routeId);
      }),
    );

    const didActiveRoutesChange = !areRouteIdSetsEqual(this.activeRouteIds, nextActiveRouteIds);

    nextActiveRouteIds.forEach((routeId) => {
      this.routeRuntimes.get(routeId)?.commit();
      this.invalidatedRouteIds.delete(routeId);
    });

    this.routeRuntimes.forEach((routeRuntime, routeId) => {
      if (nextActiveRouteIds.has(routeId)) {
        return;
      }

      routeRuntime.discardPending();

      if (!this.activeRouteIds.has(routeId) && !this.invalidatedRouteIds.has(routeId)) {
        return;
      }

      this.invalidatedRouteIds.delete(routeId);
      void routeRuntime.dispose();
    });

    this.activeRouteIds.clear();
    nextActiveRouteIds.forEach((routeId) => {
      this.activeRouteIds.add(routeId);
    });

    if (didActiveRoutesChange) {
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private async disposeFrameRuntimes(): Promise<void> {
    const frameRuntimes = this.frameRuntimes.drain();

    await Promise.all(
      frameRuntimes.map((frameRuntime) => {
        return frameRuntime.dispose();
      }),
    );
  }

  private disposeInactiveFrameRuntimes(activeFrames: ReadonlyMap<FrameConstructor, ResolvedActiveFrameRuntime>): void {
    const activeRuntimeKeys = new Map<FrameConstructor, string | undefined>();

    activeFrames.forEach((activeFrame, frame) => {
      activeRuntimeKeys.set(frame, activeFrame.runtimeKey);
    });

    const inactiveFrameRuntimes = this.frameRuntimes.collectInactiveExcept(activeRuntimeKeys);

    this.disposeFrameRuntimesAfterRender(inactiveFrameRuntimes);
  }

  private disposeFrameRuntimesAfterRender(frameRuntimes: readonly FrameRuntime<object>[]): void {
    if (frameRuntimes.length === 0) {
      return;
    }

    queueMicrotask(() => {
      void Promise.allSettled(
        frameRuntimes.map((frameRuntime) => {
          return frameRuntime.dispose();
        }),
      );
    });
  }

  private resolveRouteException(routeId: RouteRuntimeId): React.ReactNode {
    return this.routeExceptionResolvers.get(routeId)?.() ?? this.routeExceptions.get(routeId);
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
