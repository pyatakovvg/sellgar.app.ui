import type React from 'react';

import type { ApplicationControllerInterface } from '../../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../../application/session/session-runtime-state';
import { NavigationBlockerServiceInterface } from '../../../../features/navigation-blocker/contract/navigation-blocker-service';
import {
  NavigationBlockerRuntimeInterface,
  NavigationBlockerService,
} from '../../../../features/navigation-blocker/runtime/navigation-blocker-runtime';
import type { FrameConstructor } from '../../../declaration/frame';
import { FrameRuntime } from '../../../runtime/frame-runtime';
import { getLayoutMetadata, type LayoutConstructor } from '../../../../layout/declaration/layout';
import type { PolicyBoundaryDecision } from '../../../../policy/contract/policy-boundary-decision';
import { PolicyRunner } from '../../../../policy/runtime/policy-runner';
import type { RoutePolicyDeclaration } from '../../../../router/runtime/route-runtime-context';
import type { RouteRuntimeContextInterface } from '../../../../router/runtime/route-runtime-context';
import type { RouterLocationSnapshot } from '../../../../router/service/location-service';
import { NavigateServiceInterface, type RouterNavigateOptions } from '../../../../router/service/navigate-service';
import { NavigationContinuationServiceInterface } from '../../../../router/service/navigation-continuation-service';
import {
  captureRuntimeFailure,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeOwner,
} from '../../../../runtime/failure';
import { RuntimeProviderPipeline } from '../../../../runtime/provider/runtime-provider-pipeline';
import type { ProviderToken } from '../../../../runtime/provider/provider-token.ts';
import type { RuntimeScope } from '../../../../runtime/scope/base';
import { FrameRouterScope } from '../../../../runtime/scope/kind';
import { getFrameRouteDefinition } from '../../declaration/frame-route';
import { getFrameRouterDefinition, type FrameRouter } from '../../declaration/frame-router';
import type { FrameRouterMatch } from '../../matching';
import { resolveFrameExport } from '../../../resolution';

export type FrameRouterRuntimePhase =
  'disposed' | 'disposing' | 'failed' | 'forbidden' | 'idle' | 'loading' | 'not-found' | 'ready';

export interface FrameRouterRuntimeSnapshot {
  readonly active: FrameRouterRuntimeActiveFrame | null;
  readonly error: unknown | null;
  readonly matchKey: string | null;
  readonly phase: FrameRouterRuntimePhase;
}

export interface FrameRouterRuntimeActiveFrame {
  readonly exception: React.ReactNode | undefined;
  readonly fallback: React.ReactNode | undefined;
  readonly forbidden: React.ReactNode | undefined;
  readonly frame: FrameConstructor;
  readonly layouts: readonly LayoutConstructor[];
  readonly match: FrameRouterMatch;
  readonly runtime: FrameRuntime;
  readonly scope: FrameRouterScope;
}

export interface FrameRouterRuntimeLoadOptions {
  readonly app: ApplicationControllerInterface;
  readonly location: RouterLocationSnapshot;
  readonly navigateService: NavigateServiceInterface;
  readonly session: SessionRuntimeStateInterface;
  readonly signal?: AbortSignal;
}

type FrameRouterRuntimeListener = () => void;

export class FrameRouterRuntime {
  private readonly definition;
  private readonly listeners = new Set<FrameRouterRuntimeListener>();
  private readonly owner: RuntimeOwner;
  private readonly scope: FrameRouterScope;
  private readonly navigateService: NavigateServiceInterface;

  private abortController: AbortController | null = null;
  private disposePromise: Promise<void> | null = null;
  private loadedLocationSignature: string | null = null;
  private loadRevision = 0;
  private providerPipeline: RuntimeProviderPipeline | null = null;
  private routeProviderPipeline: RuntimeProviderPipeline | null = null;
  private snapshot: FrameRouterRuntimeSnapshot = {
    active: null,
    error: null,
    matchKey: null,
    phase: 'idle',
  };

  constructor(
    private readonly router: FrameRouter,
    private readonly ownerScope: RuntimeScope,
    private readonly runtimeKey: string = 'frame-router',
  ) {
    this.definition = getFrameRouterDefinition(router);
    this.owner = { id: `frame-router:${this.definition.baseSource}`, kind: 'route' };
    this.navigateService = ownerScope.get(NavigateServiceInterface);
    this.scope = new FrameRouterScope(ownerScope);

    try {
      this.definition.layouts.forEach((layout) => this.scope.activate(layout));
    } catch (error) {
      this.scope.dispose();
      throw error;
    }
  }

  async close(options?: RouterNavigateOptions): Promise<void> {
    await this.navigateService.frame.close(options);
  }

  dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise;
    }

    if (this.snapshot.phase === 'disposed') {
      return Promise.resolve();
    }

    this.abortController?.abort();
    this.loadRevision += 1;
    this.setSnapshot({ ...this.snapshot, phase: 'disposing' });
    const active = this.snapshot.active;

    this.disposePromise = Promise.allSettled([
      active?.runtime.dispose() ?? Promise.resolve(),
      this.routeProviderPipeline?.dispose() ?? Promise.resolve(),
      this.providerPipeline?.dispose() ?? Promise.resolve(),
    ])
      .then(() => {
        this.routeProviderPipeline = null;
        this.providerPipeline = null;
        this.loadedLocationSignature = null;
        active?.scope.dispose();
        this.scope.dispose();
        this.setSnapshot({ active: null, error: null, matchKey: null, phase: 'disposed' });
      })
      .finally(() => {
        this.disposePromise = null;
      });

    return this.disposePromise;
  }

  async failRender(error: unknown): Promise<void> {
    if (this.snapshot.phase === 'disposed' || this.snapshot.phase === 'disposing') {
      return;
    }

    this.setSnapshot({ ...this.snapshot, active: null, error, phase: 'failed' });
    await this.reportFailure(error, 'render');
  }

  getRouterScope(): FrameRouterScope {
    return this.scope;
  }

  getSnapshot(): FrameRouterRuntimeSnapshot {
    return this.snapshot;
  }

  async load(match: FrameRouterMatch, options: FrameRouterRuntimeLoadOptions): Promise<void> {
    const matchKey = match.sourcePath;
    const locationSignature = createLocationSignature(options.location);

    if (
      this.snapshot.matchKey === matchKey &&
      this.snapshot.phase === 'ready' &&
      this.loadedLocationSignature === locationSignature
    ) {
      return;
    }

    const revision = ++this.loadRevision;
    this.abortController?.abort();
    const abortController = createLinkedAbortController(options.signal);

    this.abortController = abortController;
    await this.disposeActiveRoute();

    if (revision !== this.loadRevision) {
      return;
    }

    this.setSnapshot({ active: null, error: null, matchKey, phase: 'loading' });
    let nextFrameRuntime: FrameRuntime | null = null;
    let nextRouteProviderPipeline: RuntimeProviderPipeline | null = null;
    let nextRouteScope: FrameRouterScope | null = null;
    let committed = false;

    try {
      const policyContext = createPolicyContext(match, options, abortController.signal);

      await this.executePolicies(
        [...this.definition.canMatch, ...collectRoutePolicies(match, 'canMatch')],
        policyContext,
      );
      throwIfAborted(abortController.signal);

      if (match.defaultSource) {
        await this.navigateService.frame.open(`/${match.defaultSource}`, { replace: true });
        this.setSnapshot({ active: null, error: null, matchKey, phase: 'idle' });
        return;
      }

      if (!match.route) {
        this.setSnapshot({ active: null, error: null, matchKey, phase: 'not-found' });
        return;
      }

      await this.executePolicies(
        [...this.definition.canActivate, ...collectRoutePolicies(match, 'canActivate')],
        policyContext,
      );
      throwIfAborted(abortController.signal);

      const frame = resolveFrameExport(await match.route.definition.load!());

      throwIfAborted(abortController.signal);

      const location = {
        ...options.location,
        params: { ...options.location.params, ...match.params },
      };
      const routeScope = this.createRouteScope(match);
      const routeProviderPipeline = new RuntimeProviderPipeline(
        routeScope,
        collectRouteProviderTokens(match),
        this.owner,
      );
      const frameRuntime = new FrameRuntime(routeScope, frame);

      nextFrameRuntime = frameRuntime;
      nextRouteProviderPipeline = routeProviderPipeline;
      nextRouteScope = routeScope;
      const providerContext = {
        params: location.params,
        props: {},
        scope: routeScope,
        signal: abortController.signal,
      };
      const routerProviderContext = {
        ...providerContext,
        scope: this.scope,
      };
      const providerPipeline = this.getOrCreateProviderPipeline();
      const commitFrame = (): void => {
        this.setSnapshot({
          active: {
            exception: resolveRouteNode(match, 'exception') ?? this.definition.exception,
            fallback: resolveRouteNode(match, 'fallback') ?? this.definition.fallback,
            forbidden: resolveRouteNode(match, 'forbidden') ?? this.definition.forbidden,
            frame,
            layouts: collectRouteLayouts(match),
            match,
            runtime: frameRuntime,
            scope: routeScope,
          },
          error: null,
          matchKey,
          phase: 'ready',
        });
        this.loadedLocationSignature = locationSignature;
        committed = true;
      };

      this.routeProviderPipeline = routeProviderPipeline;
      await providerPipeline.runBeforeLoad(routerProviderContext);
      await routeProviderPipeline.runBeforeLoad(providerContext);
      try {
        await frameRuntime.load({
          app: options.app,
          location,
          session: options.session,
          signal: abortController.signal,
        });
      } catch (error) {
        if (
          abortController.signal.aborted ||
          revision !== this.loadRevision ||
          frameRuntime.getSnapshot().phase !== 'failed'
        ) {
          throw error;
        }

        commitFrame();
        return;
      }
      await routeProviderPipeline.setup(providerContext);
      await providerPipeline.setup(routerProviderContext);
      await routeProviderPipeline.runBeforeRender(providerContext);
      await providerPipeline.runBeforeRender(routerProviderContext);
      throwIfAborted(abortController.signal);

      if (revision !== this.loadRevision) {
        await frameRuntime.dispose();
        await routeProviderPipeline.dispose();
        routeScope.dispose();
        return;
      }

      commitFrame();
    } catch (error) {
      if (!committed) {
        await Promise.allSettled([
          nextFrameRuntime?.dispose() ?? Promise.resolve(),
          nextRouteProviderPipeline?.dispose() ?? Promise.resolve(),
        ]);
        nextRouteScope?.dispose();

        if (this.routeProviderPipeline === nextRouteProviderPipeline) {
          this.routeProviderPipeline = null;
        }
      }

      if (abortController.signal.aborted || revision !== this.loadRevision) {
        return;
      }

      if (error instanceof FrameRouterBoundaryError) {
        switch (error.decision.type) {
          case 'redirect':
            await options.navigateService.to(error.decision.to, { replace: error.decision.replace ?? false });
            this.setSnapshot({ active: null, error: null, matchKey, phase: 'idle' });
            return;
          case 'forbidden':
            this.setSnapshot({ active: null, error: null, matchKey, phase: 'forbidden' });
            return;
          case 'not-found':
            this.setSnapshot({ active: null, error: null, matchKey, phase: 'not-found' });
            return;
          case 'error':
            this.setSnapshot({ active: null, error: error.decision.error, matchKey, phase: 'failed' });
            await this.reportFailure(error.decision.error, 'load');
            return;
          case 'redirect-and-save-location':
            this.ownerScope.get(NavigationContinuationServiceInterface).captureLocation({ key: error.decision.key });
            await options.navigateService.to(error.decision.to, { replace: error.decision.replace ?? false });
            this.setSnapshot({ active: null, error: null, matchKey, phase: 'idle' });
            return;
          case 'redirect-to-saved-location': {
            const target =
              this.ownerScope.get(NavigationContinuationServiceInterface).consume({ key: error.decision.key }) ??
              error.decision.fallback ??
              '/';

            await options.navigateService.to(target, { replace: error.decision.replace ?? false });
            this.setSnapshot({ active: null, error: null, matchKey, phase: 'idle' });
            return;
          }
        }
      }

      this.setSnapshot({ active: null, error, matchKey, phase: 'failed' });
      await this.reportFailure(error, 'load');
    }
  }

  subscribe(listener: FrameRouterRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  private createRouteScope(match: FrameRouterMatch): FrameRouterScope {
    const scope = new FrameRouterScope(this.scope, (registry) => {
      if (!this.ownerScope.has(NavigationBlockerRuntimeInterface)) {
        return;
      }

      registry.bind(NavigationBlockerServiceInterface).toConstantValue(
        new NavigationBlockerService(this.ownerScope.get(NavigationBlockerRuntimeInterface), {
          kind: 'frame',
          routeId: this.runtimeKey,
          router: this.router,
          sourcePath: match.sourcePath,
        }),
      );
    });

    try {
      collectRouteLayouts(match).forEach((layout) => scope.activate(layout));
      return scope;
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }

  private async disposeActiveRoute(): Promise<void> {
    const active = this.snapshot.active;
    const routeProviderPipeline = this.routeProviderPipeline;

    this.routeProviderPipeline = null;

    if (!active && !routeProviderPipeline) {
      return;
    }

    await Promise.allSettled([
      active?.runtime.dispose() ?? Promise.resolve(),
      routeProviderPipeline?.dispose() ?? Promise.resolve(),
    ]);
    active?.scope.dispose();
  }

  private async executePolicies(
    declarations: readonly RoutePolicyDeclaration[],
    context: RouteRuntimeContextInterface,
  ): Promise<void> {
    if (declarations.length === 0) {
      return;
    }

    const decision = await new PolicyRunner<RouteRuntimeContextInterface>(this.ownerScope, this.owner).execute(
      declarations,
      context,
    );

    if (decision.type !== 'continue') {
      throw new FrameRouterBoundaryError(decision);
    }
  }

  private getRouterProviderTokens(): readonly ProviderToken[] {
    return [
      ...this.definition.providers,
      ...this.definition.layouts.flatMap((layout) => getLayoutMetadata(layout).providers ?? []),
    ];
  }

  private getOrCreateProviderPipeline(): RuntimeProviderPipeline {
    this.providerPipeline ??= new RuntimeProviderPipeline(this.scope, this.getRouterProviderTokens(), this.owner);

    return this.providerPipeline;
  }

  private async reportFailure(error: unknown, operation: 'load' | 'render'): Promise<void> {
    await reportRuntimeFailure(
      this.ownerScope.get(RuntimeFailureReporterInterface),
      captureRuntimeFailure(error, {
        operation,
        owner: this.owner,
        participant: { kind: 'runtime' },
      }),
      this.owner,
      'route.activation-failed',
      'failed',
    );
  }

  private setSnapshot(snapshot: FrameRouterRuntimeSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

class FrameRouterBoundaryError extends Error {
  constructor(readonly decision: PolicyBoundaryDecision) {
    super(`Frame router завершил policy решением ${decision.type}.`);
  }
}

const createPolicyContext = (
  match: FrameRouterMatch,
  options: FrameRouterRuntimeLoadOptions,
  signal: AbortSignal,
): RouteRuntimeContextInterface => ({
  app: options.app,
  params: { ...options.location.params, ...match.params },
  session: options.session,
  signal,
});

const collectRoutePolicies = (
  match: FrameRouterMatch,
  boundary: 'canActivate' | 'canMatch',
): readonly RoutePolicyDeclaration[] => {
  return match.branch.flatMap((route) => getFrameRouteDefinition(route)[boundary]);
};

const collectRouteLayouts = (match: FrameRouterMatch): readonly LayoutConstructor[] => {
  return match.branch.flatMap((route) => getFrameRouteDefinition(route).layouts);
};

const collectRouteProviderTokens = (match: FrameRouterMatch): readonly ProviderToken<Record<string, string>>[] => {
  const layouts = collectRouteLayouts(match);

  return [
    ...match.branch.flatMap((route) => getFrameRouteDefinition(route).providers),
    ...layouts.flatMap((layout) => getLayoutMetadata(layout).providers ?? []),
  ];
};

const resolveRouteNode = <TKey extends 'exception' | 'fallback' | 'forbidden' | 'notFound'>(
  match: FrameRouterMatch,
  key: TKey,
) => {
  const branch = match.branch;

  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const value = getFrameRouteDefinition(branch[index])[key];

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

export const resolveFrameRouterBoundary = (
  match: FrameRouterMatch,
  boundary: 'exception' | 'fallback' | 'forbidden' | 'notFound',
): React.ReactNode | undefined => {
  return resolveRouteNode(match, boundary) ?? getFrameRouterDefinition(match.router)[boundary];
};

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new Error('Загрузка frame-маршрута была прервана.');
  }
};

const createLinkedAbortController = (signal?: AbortSignal): AbortController => {
  const abortController = new AbortController();

  if (!signal) {
    return abortController;
  }

  if (signal.aborted) {
    abortController.abort(signal.reason);
    return abortController;
  }

  signal.addEventListener('abort', () => abortController.abort(signal.reason), { once: true });

  return abortController;
};

const createLocationSignature = (location: RouterLocationSnapshot): string => {
  return JSON.stringify([
    location.pathname,
    location.search,
    location.hash,
    Object.entries(location.params).sort(([left], [right]) => left.localeCompare(right)),
  ]);
};
