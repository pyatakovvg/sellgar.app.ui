import type React from 'react';

import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { NavigationBlockerServiceInterface } from '../../../features/navigation-blocker/contract/navigation-blocker-service';
import {
  NavigationBlockerRuntimeInterface,
  NavigationBlockerService,
} from '../../../features/navigation-blocker/runtime/navigation-blocker-runtime';
import { ModuleRuntime } from '../../../module/runtime/module-runtime';
import { getLayoutMetadata, type LayoutConstructor } from '../../../layout/declaration/layout';
import { PolicyRunner } from '../../../policy/runtime/policy-runner';
import type { PolicyBoundaryDecision } from '../../../policy/contract/policy-boundary-decision';
import { RouteScope } from '../../../runtime/scope/kind';
import {
  RuntimeProviderPipeline,
  type RuntimeProviderPipelineContext,
} from '../../../runtime/provider/runtime-provider-pipeline';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';
import type { RuntimeScope } from '../../../runtime/scope/base';
import {
  createRuntimeRevisionGuard,
  executeRuntimeOperation,
  RuntimeOperationCoordinator,
  type RuntimeOperationResult,
} from '../../../runtime/operation';
import {
  captureRuntimeFailure,
  getRuntimeOperationError,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailure,
  type RuntimeFailureDisposition,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../../runtime/failure';
import {
  getRouteDefinition,
  isFirstAvailableRouteDefault,
  type Route,
  type RouteDefinition,
} from '../../declaration/route';
import { NavigateServiceInterface } from '../../service/navigate-service';
import { NavigationContinuationServiceInterface } from '../../service/navigation-continuation-service';
import { RouterServiceControllerInterface } from '../../service/router-service-controller';
import type { RouterLocationSnapshot } from '../../service/location-service';
import { LocationServiceInterface } from '../../service/location-service';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { createRoutePathname } from '../../utils/route-pathname';
import type {
  RoutePolicyBoundary,
  RoutePolicyDeclarations,
  RouteRuntimeContextInterface,
} from '../route-runtime-context';

export interface RouteRuntimeLoadContext {
  readonly activate?: () => void;
  readonly location: RouterLocationSnapshot;
  readonly signal: AbortSignal;
}

type RouteRuntimeExecutionContext = RouteRuntimeLoadContext;

export class RouteRuntimeNavigationException extends Error {
  constructor(readonly decision: RouteRuntimeNavigationDecision) {
    super(`Route runtime завершил операцию решением ${decision.type}.`);
  }
}

export const isRouteRuntimeNavigationException = (value: unknown): value is RouteRuntimeNavigationException => {
  return value instanceof RouteRuntimeNavigationException;
};

export type RouteRuntimeNavigationDecision =
  | {
      readonly replace: boolean;
      readonly to: string;
      readonly type: 'redirect';
    }
  | { readonly type: 'forbidden' }
  | { readonly type: 'not-found' };

export class RouteRuntime {
  private readonly definition: RouteDefinition;
  private readonly moduleRuntime: ModuleRuntime | null;
  private readonly providerTokens: readonly ProviderToken[];
  private readonly routeOwner: RuntimeOwner;
  private readonly routeScope: RouteScope;
  private providerPipeline: RuntimeProviderPipeline | undefined;

  constructor(
    route: Route,
    private readonly app: ApplicationControllerInterface,
    private readonly session: SessionRuntimeStateInterface,
    private readonly appScope: RuntimeScope,
    private readonly loaderPolicies: RoutePolicyDeclarations,
    private readonly actionPolicies: RoutePolicyDeclarations,
    private readonly routePathname: string = '/',
    private readonly basePath?: string,
    routeId: string = routePathname,
  ) {
    this.definition = getRouteDefinition(route);
    this.routeScope = new RouteScope(appScope, (registry) => {
      if (!appScope.has(NavigationBlockerRuntimeInterface)) {
        return;
      }

      registry.bind(NavigationBlockerServiceInterface).toConstantValue(
        new NavigationBlockerService(appScope.get(NavigationBlockerRuntimeInterface), {
          kind: 'route',
          routeId,
        }),
      );
    });
    this.routeOwner = { id: routePathname, kind: 'route' };
    this.activateLayouts(this.definition.layouts);
    this.providerTokens = this.getProviderTokens();
    this.moduleRuntime = this.definition.load
      ? new ModuleRuntime(this.routeScope, this.definition.load, this.routeOwner)
      : null;
  }

  getModuleRuntime(): ModuleRuntime {
    if (this.moduleRuntime === null) {
      throw new Error('Runtime модуля маршрута недоступен.');
    }

    return this.moduleRuntime;
  }

  action<TPayload>(controllerToken: DependencyToken<unknown>, payload: TPayload): Promise<unknown> {
    const moduleRuntime = this.getModuleRuntime();
    const coordinator = this.appScope.get(RuntimeOperationCoordinator);
    const location = this.getCurrentLocation();
    const abortController = new AbortController();
    const context: RouteRuntimeLoadContext = {
      location,
      signal: abortController.signal,
    };

    return coordinator.run(async () => {
      const source = this.createRuntimeSource('action');

      try {
        await this.executePolicies('canMatch', context, this.actionPolicies);
        await this.executePolicies('canAction', context, this.actionPolicies);

        return await moduleRuntime.action(controllerToken, payload, {
          params: location.params,
          props: {},
          signal: abortController.signal,
        });
      } catch (error) {
        const operationError = getRuntimeOperationError(error, source);

        if (isRouteRuntimeNavigationException(operationError.cause)) {
          await this.navigate(operationError.cause.decision);
          return undefined;
        }

        const failure = captureRuntimeFailure(error, source);

        await this.reportFailure(failure, 'action.failed', 'active');
        throw failure.cause;
      }
    });
  }

  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>) {
    return this.getModuleRuntime().getActionState<TResult>(controllerToken);
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    return this.getModuleRuntime().getController(controllerToken);
  }

  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue {
    return this.getModuleRuntime().getLoaderData<TValue>(controllerToken);
  }

  getParams(): Readonly<Record<string, string | undefined>> {
    return this.getCurrentLocation().params;
  }

  getRevalidateState(): { readonly error: unknown; readonly inProcess: boolean } {
    return EMPTY_REVALIDATE_STATE;
  }

  getRevalidateRevision(): number {
    return 0;
  }

  revalidate(): Promise<void> {
    return this.appScope.get(RuntimeOperationCoordinator).invalidateAndWait();
  }

  invoke<TValue>(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): TValue {
    const moduleRuntime = this.getModuleRuntime();

    return this.appScope.get(RuntimeOperationCoordinator).run(() => {
      return moduleRuntime.invoke<TValue>(controllerToken, method, args);
    });
  }

  subscribe(listener: () => void): () => void {
    return this.getModuleRuntime().subscribe(listener);
  }

  private getCurrentLocation(): RouterLocationSnapshot {
    const location = this.appScope.get(LocationServiceInterface).location;

    if (location === null) {
      throw new Error('Активный location маршрута недоступен.');
    }

    return location;
  }

  private async navigate(decision: RouteRuntimeNavigationDecision): Promise<void> {
    if (decision.type !== 'redirect') {
      throw new RouteRuntimeNavigationException(decision);
    }

    const navigation = this.appScope.get(NavigateServiceInterface);

    if (decision.replace) {
      await navigation.replace(decision.to);
      return;
    }

    await navigation.to(decision.to);
  }

  getRouteScope(): RuntimeScope {
    return this.routeScope;
  }

  getException(inheritedException?: React.ReactNode): React.ReactNode {
    const moduleRuntime = this.moduleRuntime?.getErrorBoundaryModuleOrNull();

    return moduleRuntime?.metadata.exception ?? this.definition.exception ?? inheritedException;
  }

  async loader(context: RouteRuntimeLoadContext): Promise<unknown> {
    this.redirectStaticDefaultRoute(context);

    const operationGuard = createRuntimeRevisionGuard(this.session);
    const location = context.location;
    const result = await executeRuntimeOperation({
      guard: operationGuard,
      operation: async () => {
        this.appScope.get(RouterServiceControllerInterface).syncLocation(location);

        await this.executePolicies('canMatch', context, this.loaderPolicies);
        await this.redirectFirstAvailableDefaultRoute(context);
        await this.executePolicies('canActivate', context, this.loaderPolicies);
        context.activate?.();

        if (this.moduleRuntime === null) {
          await this.runProviderBeforeLoad(context);
          await this.runProviderSetup(context);
          await this.runProviderBeforeRender(context);

          return null;
        }

        const moduleRuntime = this.getModuleRuntime();

        await this.runProviderBeforeLoad(context);

        const loaderData = await moduleRuntime.load({
          params: location.params,
          props: {},
          signal: context.signal,
        });

        await this.runProviderSetup(context);
        await this.runProviderBeforeRender(context);

        return loaderData;
      },
      signal: context.signal,
      source: this.createRuntimeSource('loader'),
    });

    return await this.applyLoaderOperationResult(result);
  }

  commit(): void {
    this.moduleRuntime?.commit();
  }

  discardPending(): void {
    void this.disposeProviders();
    this.moduleRuntime?.discardPending();
  }

  async dispose(): Promise<void> {
    await this.disposeProviders();
    await this.moduleRuntime?.dispose();
  }

  private async runProviderBeforeLoad(context: RouteRuntimeLoadContext): Promise<void> {
    await this.runProviders(context, 'beforeLoad');
  }

  private async runProviderSetup(context: RouteRuntimeLoadContext): Promise<void> {
    await this.runProviders(context, 'setup');
  }

  private redirectStaticDefaultRoute(context: RouteRuntimeLoadContext): void {
    if (
      this.definition.defaultTo === undefined ||
      isFirstAvailableRouteDefault(this.definition.defaultTo) ||
      !this.isDefaultRouteLocation(context.location)
    ) {
      return;
    }

    throw createRouteRuntimeNavigationException({ replace: true, to: this.definition.defaultTo, type: 'redirect' });
  }

  private async redirectFirstAvailableDefaultRoute(context: RouteRuntimeLoadContext): Promise<void> {
    if (
      this.definition.defaultTo === undefined ||
      !isFirstAvailableRouteDefault(this.definition.defaultTo) ||
      !this.isDefaultRouteLocation(context.location)
    ) {
      return;
    }

    const target = await this.resolveFirstAvailableRoute(context, this.definition.routes, this.routePathname);

    if (target === null) {
      throw createRouteRuntimeNavigationException({ type: 'forbidden' });
    }

    throw createRouteRuntimeNavigationException({ replace: true, to: target, type: 'redirect' });
  }

  private async resolveFirstAvailableRoute(
    context: RouteRuntimeLoadContext,
    routes: readonly Route[],
    parentPathname: string,
  ): Promise<string | null> {
    for (const route of routes) {
      const definition = getRouteDefinition(route);

      if (definition.path === '*') {
        continue;
      }

      const routePathname = createRoutePathname(parentPathname, definition.path);

      if (!(await this.canMatchDefaultRoute(route, context))) {
        continue;
      }

      if (isFirstAvailableRouteTarget(route)) {
        return routePathname;
      }

      const target = await this.resolveFirstAvailableRoute(context, definition.routes, routePathname);

      if (target !== null) {
        return target;
      }
    }

    return null;
  }

  private async canMatchDefaultRoute(route: Route, context: RouteRuntimeLoadContext): Promise<boolean> {
    const definition = getRouteDefinition(route);

    if (definition.canMatch.length === 0) {
      return true;
    }

    const policyRunner = new PolicyRunner<RouteRuntimeContextInterface>(this.appScope, this.routeOwner);

    return await policyRunner.test(definition.canMatch, this.createPolicyContext(context));
  }

  private isDefaultRouteLocation(location: RouterLocationSnapshot): boolean {
    return (
      normalizePathname(location.pathname) === normalizePathname(removeBasePath(this.routePathname, this.basePath))
    );
  }

  private async runProviderBeforeRender(context: RouteRuntimeLoadContext): Promise<void> {
    await this.runProviders(context, 'beforeRender');
  }

  private async runProviders(
    context: RouteRuntimeLoadContext,
    phase: 'beforeLoad' | 'beforeRender' | 'setup',
  ): Promise<void> {
    if (this.providerTokens.length === 0) {
      return;
    }

    const providerContext = this.createProviderContext(context);
    const providerPipeline = this.getOrCreateProviderPipeline();

    if (phase === 'beforeLoad') {
      await providerPipeline.runBeforeLoad(providerContext);
    } else if (phase === 'beforeRender') {
      await providerPipeline.runBeforeRender(providerContext);
    } else if (phase === 'setup') {
      await providerPipeline.setup(providerContext);
    }
  }

  private createProviderContext(context: RouteRuntimeLoadContext): RuntimeProviderPipelineContext {
    return {
      params: context.location.params,
      props: {},
      scope: this.routeScope,
      signal: context.signal,
    };
  }

  private activateLayouts(layouts: readonly LayoutConstructor[]): void {
    try {
      layouts.forEach((layout) => {
        this.routeScope.activate(layout);
      });
    } catch (error) {
      this.routeScope.dispose();
      throw error;
    }
  }

  private getProviderTokens(): readonly ProviderToken[] {
    return [
      ...this.definition.providers,
      ...this.definition.layouts.flatMap((layout) => {
        return getLayoutMetadata(layout).providers ?? [];
      }),
    ];
  }

  private getOrCreateProviderPipeline(): RuntimeProviderPipeline {
    this.providerPipeline ??= new RuntimeProviderPipeline(this.routeScope, this.providerTokens, this.routeOwner);

    return this.providerPipeline;
  }

  private async disposeProviders(): Promise<void> {
    const providerPipeline = this.providerPipeline;

    if (!providerPipeline) {
      return;
    }

    this.providerPipeline = undefined;

    await providerPipeline.dispose();
  }

  private async applyLoaderOperationResult(result: RuntimeOperationResult<unknown>): Promise<unknown> {
    switch (result.type) {
      case 'completed':
        return result.value;
      case 'interrupted':
        return null;
      case 'rejected':
        throw result.error;
      case 'failed':
        if (isRouteRuntimeNavigationException(result.failure.cause)) {
          throw result.failure.cause;
        }

        await this.reportLoaderFailure(result.failure);
        throw result.failure.cause;
      case 'escalated':
        await this.reportLoaderFailure(result.failure);
        throw result.failure.cause;
    }
  }

  private async executePolicies(
    boundary: RoutePolicyBoundary,
    context: RouteRuntimeExecutionContext,
    policies: RoutePolicyDeclarations,
  ): Promise<void> {
    const declarations = policies[boundary];

    if (declarations.length === 0) {
      return;
    }

    const policyRunner = new PolicyRunner<RouteRuntimeContextInterface>(this.appScope, this.routeOwner);
    const decision = await policyRunner.execute(declarations, this.createPolicyContext(context));

    this.applyPolicyDecision(decision);
  }

  private createPolicyContext(context: RouteRuntimeExecutionContext): RouteRuntimeContextInterface {
    return {
      app: this.app,
      params: context.location.params,
      session: this.session,
      signal: context.signal,
    };
  }

  private applyPolicyDecision(decision: PolicyBoundaryDecision): void {
    switch (decision.type) {
      case 'continue':
        return;
      case 'redirect':
        throw createRouteRuntimeNavigationException({
          replace: decision.replace ?? false,
          to: decision.to,
          type: 'redirect',
        });
      case 'redirect-and-save-location':
        this.redirectAndSaveLocation(decision.to, decision.key, decision.replace);
        return;
      case 'redirect-to-saved-location':
        this.redirectToSaved(decision.key, decision.fallback, decision.replace);
        return;
      case 'forbidden':
        throw createRouteRuntimeNavigationException({ type: 'forbidden' });
      case 'not-found':
        throw createRouteRuntimeNavigationException({ type: 'not-found' });
      case 'error':
        throw decision.error;
    }
  }

  private createRuntimeSource(operation: string): RuntimeFailureSource {
    return {
      operation,
      owner: this.routeOwner,
      participant: { kind: 'runtime' },
    };
  }

  private async reportLoaderFailure(failure: RuntimeFailure): Promise<void> {
    const disposition: RuntimeFailureDisposition =
      failure.source.owner.kind === 'module' ? 'module.activation-failed' : 'route.activation-failed';

    await this.reportFailure(failure, disposition, 'failed');
  }

  private async reportFailure(
    failure: RuntimeFailure,
    disposition: RuntimeFailureDisposition,
    ownerState: string,
  ): Promise<void> {
    await reportRuntimeFailure(
      this.appScope.get(RuntimeFailureReporterInterface),
      failure,
      this.routeOwner,
      disposition,
      ownerState,
    );
  }

  private redirectAndSaveLocation(to: string, key: string | undefined, shouldReplace = false): never {
    this.appScope.get(NavigationContinuationServiceInterface).captureLocation({
      key,
    });

    throw createRouteRuntimeNavigationException({ replace: shouldReplace, to, type: 'redirect' });
  }

  private redirectToSaved(key: string | undefined, fallback = '/', shouldReplace = false): never {
    const target =
      this.appScope.get(NavigationContinuationServiceInterface).consume({
        basePath: this.basePath,
        key,
      }) ?? fallback;

    throw createRouteRuntimeNavigationException({ replace: shouldReplace, to: target, type: 'redirect' });
  }
}

const removeBasePath = (pathname: string, basePath: string | undefined): string => {
  if (!basePath || basePath === '/') {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }

  return pathname;
};

const normalizePathname = (pathname: string): string => {
  const normalizedPathname = `/${pathname}`.replace(/\/+/g, '/').replace(/\/$/, '');

  return normalizedPathname === '' ? '/' : normalizedPathname;
};

const isFirstAvailableRouteTarget = (route: Route): boolean => {
  const definition = getRouteDefinition(route);

  return definition.path !== undefined || definition.load !== undefined;
};

const createRouteRuntimeNavigationException = (
  decision: RouteRuntimeNavigationDecision,
): RouteRuntimeNavigationException => {
  return new RouteRuntimeNavigationException(decision);
};

const EMPTY_REVALIDATE_STATE = {
  error: undefined,
  inProcess: false,
} as const;
