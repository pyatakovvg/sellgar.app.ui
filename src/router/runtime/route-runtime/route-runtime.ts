import type React from 'react';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect, replace } from 'react-router';

import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { MODULE_ACTION_ID_FIELD, ModuleRuntime } from '../../../module/runtime/module-runtime';
import { FrameRuntime } from '../../../frame/runtime/frame-runtime';
import { getFrameMetadata, type FrameConstructor } from '../../../frame/declaration/frame';
import type { FrameSourceCloseHandler, FrameSourceContextInterface } from '../../../frame/source/frame-source';
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
  type RuntimeOperationResult,
} from '../../../runtime/operation';
import {
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailure,
  type RuntimeFailureDisposition,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../../runtime/failure';
import { isFirstAvailableRouteDefault, type Route } from '../../declaration/route';
import { RouterParamsConverterInterface } from '../../params/router-params-converter';
import { NavigateServiceInterface } from '../../service/navigate-service';
import { NavigationContinuationServiceInterface } from '../../service/navigation-continuation-service';
import { RouterServiceControllerInterface } from '../../service/router-service-controller';
import type { RouterLocationSnapshot } from '../../service/location-service';
import { parseHashToObject } from '../../utils/hash-utils';
import { createRoutePathname } from '../../utils/route-pathname';
import { parseSearchParams } from '../../utils/search-utils';
import { RouterRuntime } from '../router-runtime';
import { FrameRuntimeRegistry } from '../frame-runtime-registry';

import type {
  RoutePolicyBoundary,
  RoutePolicyDeclarations,
  RouteRuntimeContextInterface,
} from '../route-runtime-context';

export class RouteRuntime {
  private readonly moduleRuntime: ModuleRuntime | null;
  private readonly preparedFrameRuntimes = new FrameRuntimeRegistry();
  private readonly providerTokens: readonly ProviderToken[];
  private readonly routeOwner: RuntimeOwner;
  private readonly routeScope: RouteScope;
  private providerPipeline: RuntimeProviderPipeline | undefined;

  constructor(
    private readonly route: Route,
    private readonly app: ApplicationControllerInterface,
    private readonly session: SessionRuntimeStateInterface,
    private readonly appScope: RuntimeScope,
    private readonly loaderPolicies: RoutePolicyDeclarations,
    private readonly actionPolicies: RoutePolicyDeclarations,
    private readonly availableFrames: readonly FrameConstructor[] = [],
    private readonly routePathname: string = '/',
    private readonly basePath?: string,
  ) {
    this.routeScope = new RouteScope(appScope);
    this.routeOwner = { id: routePathname, kind: 'route' };
    this.activateLayouts(route.layouts);
    this.providerTokens = this.getProviderTokens();
    this.moduleRuntime = route.load ? new ModuleRuntime(this.routeScope, route.load, this.routeOwner) : null;
  }

  getModuleRuntime(): ModuleRuntime {
    if (this.moduleRuntime === null) {
      throw new Error('Runtime модуля маршрута недоступен.');
    }

    return this.moduleRuntime;
  }

  getRuntimeScope(): RuntimeScope {
    return this.moduleRuntime?.getViewModuleOrNull()?.scope ?? this.routeScope;
  }

  getRouteScope(): RuntimeScope {
    return this.routeScope;
  }

  getPreparedFrameRuntime<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
  ): FrameRuntime<TProps> | null {
    return this.preparedFrameRuntimes.getPrepared(frame, runtimeKey);
  }

  prepareFrameRuntime<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
    props: TProps,
    ownerScope: RuntimeScope,
  ): FrameRuntime<TProps> {
    return this.preparedFrameRuntimes.prepare(frame, runtimeKey, props, ownerScope);
  }

  getException(inheritedException?: React.ReactNode): React.ReactNode {
    const moduleRuntime = this.moduleRuntime?.getErrorBoundaryModuleOrNull();

    return moduleRuntime?.metadata.exception ?? this.route.exception ?? inheritedException;
  }

  async loader(args: LoaderFunctionArgs): Promise<unknown> {
    const routerRuntime = this.appScope.get(RouterRuntime);
    const completeRouteLoading =
      typeof routerRuntime.trackRouteLoading === 'function' ? routerRuntime.trackRouteLoading() : () => {};

    try {
      this.redirectStaticDefaultRoute(args);

      const operationGuard = createRuntimeRevisionGuard(this.session);
      const location = createRouteLocation(args, this.basePath);
      const result = await executeRuntimeOperation({
        guard: operationGuard,
        operation: async () => {
          this.appScope.get(RouterServiceControllerInterface).syncLocation(location);

          await this.executePolicies('canMatch', args, this.loaderPolicies);
          await this.redirectFirstAvailableDefaultRoute(args);

          if (this.moduleRuntime === null) {
            await this.executePolicies('canActivate', args, this.loaderPolicies);

            await this.runProviderBeforeLoad(args);
            await this.runProviderSetup(args);
            await this.runProviderBeforeRender(args);
            await this.loadFrameRuntimes(args, this.appScope, location);
            await this.handleLoaderSessionTransition(args, operationGuard.revision);

            return null;
          }

          const moduleRuntime = this.getModuleRuntime();

          await this.executePolicies('canActivate', args, this.loaderPolicies);

          await this.runProviderBeforeLoad(args);

          const loaderData = await moduleRuntime.load({
            params: args.params,
            request: args.request,
          });

          await this.runProviderSetup(args);
          await this.runProviderBeforeRender(args);
          await this.loadFrameRuntimes(args, this.getRuntimeScope(), location);
          await this.handleLoaderSessionTransition(args, operationGuard.revision);

          return loaderData;
        },
        signal: args.request.signal,
        source: this.createRuntimeSource('loader'),
      });

      return await this.applyLoaderOperationResult(args, operationGuard.revision, result);
    } finally {
      completeRouteLoading();
    }
  }

  async action(args: ActionFunctionArgs): Promise<unknown> {
    const operationGuard = createRuntimeRevisionGuard(this.session);
    const moduleRuntime = this.getModuleRuntime();
    let actionId: string | null = null;
    const result = await executeRuntimeOperation({
      guard: operationGuard,
      operation: async () => {
        actionId = await parseModuleActionId(args.request);

        await this.executePolicies('canMatch', args, this.actionPolicies);
        await this.executePolicies('canAction', args, this.actionPolicies);

        return await moduleRuntime.runAction(actionId, {
          params: args.params,
          request: args.request,
        });
      },
      signal: args.request.signal,
      source: this.createRuntimeSource('action'),
    });

    return await this.applyActionOperationResult(args, operationGuard.revision, moduleRuntime, actionId, result);
  }

  commit(): void {
    this.moduleRuntime?.commit();
  }

  discardPending(): void {
    void this.disposeProviders();
    void this.disposePreparedFrameRuntimes();
    this.moduleRuntime?.discardPending();
  }

  async dispose(): Promise<void> {
    await this.disposeProviders();
    await this.disposePreparedFrameRuntimes();
    await this.moduleRuntime?.dispose();
  }

  private async runProviderBeforeLoad(args: LoaderFunctionArgs): Promise<void> {
    await this.runProviders(args, 'beforeLoad');
  }

  private async runProviderSetup(args: LoaderFunctionArgs): Promise<void> {
    await this.runProviders(args, 'setup');
  }

  private redirectStaticDefaultRoute(args: LoaderFunctionArgs): void {
    if (
      this.route.defaultTo === undefined ||
      isFirstAvailableRouteDefault(this.route.defaultTo) ||
      !this.isDefaultRouteRequest(args.request)
    ) {
      return;
    }

    throw replace(this.route.defaultTo);
  }

  private async redirectFirstAvailableDefaultRoute(args: LoaderFunctionArgs): Promise<void> {
    if (
      this.route.defaultTo === undefined ||
      !isFirstAvailableRouteDefault(this.route.defaultTo) ||
      !this.isDefaultRouteRequest(args.request)
    ) {
      return;
    }

    const target = await this.resolveFirstAvailableRoute(args, this.route.routes, this.routePathname);

    if (target === null) {
      throw new Response(null, { status: 403 });
    }

    throw replace(target);
  }

  private async resolveFirstAvailableRoute(
    args: LoaderFunctionArgs,
    routes: readonly Route[],
    parentPathname: string,
  ): Promise<string | null> {
    for (const route of routes) {
      if (route.path === '*') {
        continue;
      }

      const routePathname = createRoutePathname(parentPathname, route.path);

      if (!(await this.canMatchDefaultRoute(route, args))) {
        continue;
      }

      if (isFirstAvailableRouteTarget(route)) {
        return routePathname;
      }

      const target = await this.resolveFirstAvailableRoute(args, route.routes, routePathname);

      if (target !== null) {
        return target;
      }
    }

    return null;
  }

  private async canMatchDefaultRoute(route: Route, args: LoaderFunctionArgs): Promise<boolean> {
    if (route.canMatch.length === 0) {
      return true;
    }

    const policyRunner = new PolicyRunner<RouteRuntimeContextInterface>(this.appScope, this.routeOwner);

    return await policyRunner.test(route.canMatch, this.createPolicyContext(args));
  }

  private isDefaultRouteRequest(request: Request): boolean {
    const url = new URL(request.url);
    const pathname = removeBasePath(url.pathname, this.basePath);

    return normalizePathname(pathname) === normalizePathname(this.routePathname);
  }

  private async runProviderBeforeRender(args: LoaderFunctionArgs): Promise<void> {
    await this.runProviders(args, 'beforeRender');
  }

  private async runProviders(args: LoaderFunctionArgs, phase: 'beforeLoad' | 'beforeRender' | 'setup'): Promise<void> {
    if (this.providerTokens.length === 0) {
      return;
    }

    const context = this.createProviderContext(args);
    const providerPipeline = this.getOrCreateProviderPipeline();

    if (phase === 'beforeLoad') {
      await providerPipeline.runBeforeLoad(context);
    } else if (phase === 'beforeRender') {
      await providerPipeline.runBeforeRender(context);
    } else if (phase === 'setup') {
      await providerPipeline.setup(context);
    }
  }

  private createProviderContext(args: LoaderFunctionArgs): RuntimeProviderPipelineContext {
    return {
      params: args.params,
      props: {},
      request: args.request,
      scope: this.routeScope,
      signal: args.request.signal,
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
      ...this.route.providers,
      ...this.route.layouts.flatMap((layout) => {
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

  private async loadFrameRuntimes(
    args: LoaderFunctionArgs,
    ownerScope: RuntimeScope,
    location: RouterLocationSnapshot,
  ): Promise<void> {
    if (this.availableFrames.length === 0 || !this.isDefaultRouteRequest(args.request)) {
      return;
    }

    const navigateService = this.appScope.get(NavigateServiceInterface);
    const routerRuntime = this.appScope.get(RouterRuntime);
    const sourceContext = this.createFrameSourceContext(location, navigateService);
    const activeFrames = this.resolveActiveFrames(sourceContext, ownerScope);

    await Promise.all(
      activeFrames.map(async (activeFrame) => {
        const existingRuntime = routerRuntime.getPreparedFrameRuntime(activeFrame.frame, activeFrame.runtimeKey);
        const runtime =
          existingRuntime ??
          routerRuntime.prepareFrameRuntime(
            activeFrame.frame,
            activeFrame.runtimeKey,
            activeFrame.props,
            activeFrame.ownerScope,
          );

        await runtime
          .load({
            app: this.app,
            close: activeFrame.close,
            location,
            navigateService,
            session: this.session,
          })
          .catch((error: unknown) => {
            if (args.request.signal.aborted || isFrameRuntimeCancellationError(error)) {
              return;
            }
          });
      }),
    );
  }

  private createFrameSourceContext(
    location: RouterLocationSnapshot,
    navigateService: NavigateServiceInterface,
  ): FrameSourceContextInterface {
    return {
      location,
      navigateService,
      paramsConverter: this.appScope.get(RouterParamsConverterInterface),
    };
  }

  private async handleLoaderSessionTransition(args: LoaderFunctionArgs, sessionRevision: number): Promise<void> {
    if (this.session.revision === sessionRevision) {
      return;
    }

    await this.executePolicies('canMatch', args, this.loaderPolicies);
    await this.executePolicies('canActivate', args, this.loaderPolicies);
  }

  private async handleActionSessionTransition(args: ActionFunctionArgs, sessionRevision: number): Promise<void> {
    if (this.session.revision === sessionRevision) {
      return;
    }

    await this.executePolicies('canMatch', args, this.actionPolicies);
    await this.executePolicies('canAction', args, this.actionPolicies);
  }

  private async applyLoaderOperationResult(
    args: LoaderFunctionArgs,
    sessionRevision: number,
    result: RuntimeOperationResult<unknown>,
  ): Promise<unknown> {
    switch (result.type) {
      case 'completed':
        return result.value;
      case 'interrupted':
        await this.handleLoaderSessionTransition(args, sessionRevision);
        return null;
      case 'rejected':
        await this.handleLoaderSessionTransition(args, sessionRevision);
        throw result.error;
      case 'failed':
        await this.handleLoaderSessionTransition(args, sessionRevision);
        await this.reportLoaderFailure(result.failure);
        throw result.failure.cause;
    }
  }

  private async applyActionOperationResult(
    args: ActionFunctionArgs,
    sessionRevision: number,
    moduleRuntime: ModuleRuntime,
    actionId: string | null,
    result: RuntimeOperationResult<unknown>,
  ): Promise<unknown> {
    switch (result.type) {
      case 'completed':
        moduleRuntime.completeAction(requireActionId(actionId), result.value);
        return null;
      case 'interrupted':
        await this.handleActionSessionTransition(args, sessionRevision);
        interruptModuleAction(moduleRuntime, actionId);
        return null;
      case 'rejected':
        await this.handleActionSessionTransition(args, sessionRevision);

        if (!failModuleAction(moduleRuntime, actionId, result.error)) {
          throw result.error;
        }

        return null;
      case 'failed':
        await this.handleActionSessionTransition(args, sessionRevision);
        await this.reportFailure(result.failure, 'action.failed', 'active');

        if (!failModuleAction(moduleRuntime, actionId, result.failure.cause)) {
          throw result.failure.cause;
        }

        return null;
    }
  }

  private resolveActiveFrames(
    context: FrameSourceContextInterface,
    ownerScope: RuntimeScope,
  ): PreparedFrameRuntimeEntry[] {
    let activeFrame: PreparedFrameRuntimeEntry | null = null;

    for (const frame of this.availableFrames) {
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
        close: result.close,
        frame,
        ownerScope,
        props: result.props,
        runtimeKey: result.runtimeKey,
      };
    }

    return activeFrame ? [activeFrame] : [];
  }

  private async disposePreparedFrameRuntimes(): Promise<void> {
    await Promise.all(
      [...this.availableFrames].flatMap((frame) => {
        const runtimes = this.preparedFrameRuntimes.drainFrame(frame);

        return runtimes.map((runtime) => {
          return runtime.dispose();
        });
      }),
    );
  }

  private async executePolicies(
    boundary: RoutePolicyBoundary,
    args: ActionFunctionArgs | LoaderFunctionArgs,
    policies: RoutePolicyDeclarations,
  ): Promise<void> {
    const declarations = policies[boundary];

    if (declarations.length === 0) {
      return;
    }

    const policyRunner = new PolicyRunner<RouteRuntimeContextInterface>(this.appScope, this.routeOwner);
    const decision = await policyRunner.execute(declarations, this.createPolicyContext(args));

    this.applyPolicyDecision(decision);
  }

  private createPolicyContext(args: ActionFunctionArgs | LoaderFunctionArgs): RouteRuntimeContextInterface {
    return {
      app: this.app,
      params: args.params,
      request: args.request,
      session: this.session,
      signal: args.request.signal,
    };
  }

  private applyPolicyDecision(decision: PolicyBoundaryDecision): void {
    switch (decision.type) {
      case 'continue':
        return;
      case 'redirect':
        throw decision.replace ? replace(decision.to) : redirect(decision.to);
      case 'redirect-and-save-location':
        this.redirectAndSaveLocation(decision.to, decision.key, decision.replace);
        return;
      case 'redirect-to-saved-location':
        this.redirectToSaved(decision.key, decision.fallback, decision.replace);
        return;
      case 'forbidden':
        throw new Response(null, { status: 403 });
      case 'not-found':
        throw new Response(null, { status: 404 });
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
    if (failure.cause instanceof Response) {
      return;
    }

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

    throw shouldReplace ? replace(to) : redirect(to);
  }

  private redirectToSaved(key: string | undefined, fallback = '/', shouldReplace = false): never {
    const target =
      this.appScope.get(NavigationContinuationServiceInterface).consume({
        basePath: this.basePath,
        key,
      }) ?? fallback;

    throw shouldReplace ? replace(target) : redirect(target);
  }
}

const parseModuleActionId = async (request: Request): Promise<string> => {
  const formData = await request.clone().formData();
  const actionId = formData.get(MODULE_ACTION_ID_FIELD);

  return requireActionId(actionId);
};

const requireActionId = (actionId: FormDataEntryValue | string | null): string => {
  if (typeof actionId !== 'string' || actionId.length === 0) {
    throw new Error('Идентификатор действия контроллера некорректен.');
  }

  return actionId;
};

const failModuleAction = (moduleRuntime: ModuleRuntime, actionId: string | null, error: unknown): boolean => {
  return actionId === null ? false : moduleRuntime.failAction(actionId, error);
};

const interruptModuleAction = (moduleRuntime: ModuleRuntime, actionId: string | null): void => {
  if (actionId !== null) {
    moduleRuntime.interruptAction(actionId);
  }
};

interface PreparedFrameRuntimeEntry<TProps extends object = object> {
  readonly close: FrameSourceCloseHandler;
  readonly frame: FrameConstructor<TProps>;
  readonly ownerScope: RuntimeScope;
  readonly props: TProps;
  readonly runtimeKey?: string;
}

const isFrameRuntimeCancellationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'CanceledError' || error.message === 'canceled' || error.message === 'Рендеринг фрейма был прерван.'
  );
};

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
  return route.path !== undefined || route.load !== undefined;
};

const createRouteLocation = (args: LoaderFunctionArgs, basePath: string | undefined): RouterLocationSnapshot => {
  const url = new URL(args.request.url);
  const hash = url.hash || getBrowserLocationHash();

  return {
    hash,
    hashParams: parseHashToObject(hash),
    key: args.request.url,
    params: args.params,
    pathname: removeBasePath(url.pathname, basePath),
    search: url.search,
    searchParams: parseSearchParams(url.search),
    state: null,
  };
};

const getBrowserLocationHash = (): string => {
  if (typeof globalThis.location?.hash !== 'string') {
    return '';
  }

  return globalThis.location.hash;
};
