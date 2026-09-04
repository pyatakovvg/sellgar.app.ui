import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { NavigationBlockerServiceInterface } from '../../../features/navigation-blocker/contract/navigation-blocker-service';
import {
  createNavigationBlockerBoundary,
  NavigationBlockerRuntimeInterface,
  NavigationBlockerService,
  type NavigationBlockerBoundary,
} from '../../../features/navigation-blocker/runtime/navigation-blocker-runtime';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import { RouterParamsConverterInterface } from '../../params/router-params-converter';
import {
  ModuleRuntime,
  type ActiveModuleRuntime,
  type ModuleRuntimeActionState,
  type ModuleRuntimeRevalidateOptions,
  type ModuleRuntimeRevalidateState,
} from '../../../module/runtime/module-runtime';
import type { PolicyBoundaryDecision } from '../../../policy/contract/policy-boundary-decision';
import { PolicyRunner } from '../../../policy/runtime/policy-runner';
import { getRouteDefinition, type RouteDeclaration, type RouteDefinition } from '../../declaration/route';
import {
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailure,
  type RuntimeFailureDisposition,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../../runtime/failure/runtime-failure';
import { captureRuntimeFailure } from '../../../runtime/failure/runtime-failure-signal';
import {
  createRuntimeRevisionGuard,
  executeRuntimeOperation,
  type RuntimeOperationResult,
} from '../../../runtime/operation/runtime-operation';
import { ProviderPipeline } from '../../../runtime/provider/provider-pipeline';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { RouteScope } from '../../../runtime/scope/kind/route-scope';
import { createRouteScopedNavigate, NavigateServiceInterface } from '../../service/navigate-service';
import { LocationServiceInterface, ScopedLocationService } from '../../service/location-service';
import type { RoutePolicyBoundary, RouteRuntimeContextInterface } from '../route-runtime-context';

export type RouteRuntimePhase =
  'active' | 'disposed' | 'empty' | 'failed' | 'forbidden' | 'not-found' | 'pending' | 'preparing' | 'retained';

export type RouteRuntimeBoundaryPhase = Extract<RouteRuntimePhase, 'failed' | 'forbidden' | 'not-found'>;

export interface RouteRuntimeSnapshot {
  readonly error: unknown | null;
  readonly phase: RouteRuntimePhase;
}

export interface RouteRuntimePrepareContext {
  readonly params: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
}

export interface RouteRuntimeActionContext {
  readonly signal: AbortSignal;
}

export interface RouteRuntimeActionExecution<TPresentation = unknown> {
  readonly execute: () => Promise<unknown>;
  readonly runtime: RouteActivationRuntime<TPresentation>;
  readonly signal: AbortSignal;
}

export interface RouteRuntimeCallbacks<TPresentation = unknown> {
  readonly executeAction?: (execution: RouteRuntimeActionExecution<TPresentation>) => Promise<unknown>;
  readonly onRenderFailure?: (runtime: RouteActivationRuntime<TPresentation>, error: unknown) => Promise<void>;
}

export interface RouteRuntimeRevalidateOptions {
  readonly controllerToken?: DependencyToken<unknown>;
  readonly signal?: AbortSignal;
}

export interface RouteRuntimePendingFailure {
  readonly error: unknown;
}

type RouteRuntimeListener = () => void;

type RouteRuntimeState =
  | { readonly phase: 'empty' }
  | {
      readonly params: Readonly<Record<string, unknown>>;
      readonly phase: 'preparing';
    }
  | {
      readonly failure: RouteRuntimePendingFailure | null;
      readonly params: Readonly<Record<string, unknown>>;
      readonly phase: 'pending';
    }
  | {
      readonly params: Readonly<Record<string, unknown>>;
      readonly phase: 'active';
    }
  | {
      readonly params: Readonly<Record<string, unknown>>;
      readonly phase: 'retained';
    }
  | {
      readonly error: unknown;
      readonly params: Readonly<Record<string, unknown>>;
      readonly phase: 'failed';
    }
  | {
      readonly params: Readonly<Record<string, unknown>>;
      readonly phase: 'forbidden' | 'not-found';
    }
  | { readonly phase: 'disposed' };

export class RouteActivationRuntime<TPresentation = unknown> {
  private readonly definition: RouteDefinition;
  private readonly lifecycleAbortController = new AbortController();
  private readonly listeners = new Set<RouteRuntimeListener>();
  private readonly locationService: ScopedLocationService | null;
  private readonly moduleRuntime: ModuleRuntime<TPresentation> | null;
  private readonly navigationBlockerBoundary: NavigationBlockerBoundary;
  private readonly owner: RuntimeOwner;
  private readonly policyRunner: PolicyRunner<RouteRuntimeContextInterface>;
  private readonly routeScope: RouteScope;
  private disposePromise: Promise<void> | null = null;
  private operationCounter = 0;
  private prepareAbortController: AbortController | null = null;
  private preparePromise: Promise<void> | null = null;
  private providerPipeline: ProviderPipeline | null = null;
  private refreshBoundary: RouteRuntimeSnapshot | null = null;
  private snapshot: RouteRuntimeSnapshot = ROUTE_RUNTIME_SNAPSHOTS.empty;
  private snapshotState: RouteRuntimeState | null = null;
  private state: RouteRuntimeState = { phase: 'empty' };
  private unsubscribeModule: (() => void) | null = null;

  constructor(
    readonly route: RouteDeclaration,
    ownerScope: RuntimeScope,
    exportResolver: ModuleExportResolverInterface<TPresentation>,
    readonly runtimeId: string,
    private readonly callbacks: RouteRuntimeCallbacks<TPresentation> = {},
  ) {
    assertRouteId(runtimeId);

    this.definition = getRouteDefinition(route);
    this.navigationBlockerBoundary = createNavigationBlockerBoundary();
    this.owner = { id: runtimeId, kind: 'route' };
    this.locationService =
      ownerScope.has(LocationServiceInterface) && ownerScope.has(RouterParamsConverterInterface)
        ? new ScopedLocationService(
            ownerScope.get(LocationServiceInterface),
            ownerScope.get(RouterParamsConverterInterface),
          )
        : null;
    this.routeScope = new RouteScope(ownerScope, (registry) => {
      if (this.locationService !== null) {
        registry.bind(LocationServiceInterface).toConstantValue(this.locationService);
      }

      if (ownerScope.has(NavigationBlockerRuntimeInterface)) {
        registry
          .bind(NavigationBlockerServiceInterface)
          .toConstantValue(
            new NavigationBlockerService(
              ownerScope.get(NavigationBlockerRuntimeInterface),
              this.navigationBlockerBoundary,
            ),
          );
      }

      if (!ownerScope.has(NavigateServiceInterface)) {
        return;
      }

      registry
        .bind(NavigateServiceInterface)
        .toConstantValue(createRouteScopedNavigate(ownerScope.get(NavigateServiceInterface), runtimeId));
    });

    try {
      for (const bindingOwner of this.definition.bindingOwners) {
        this.routeScope.activate(bindingOwner);
      }

      this.policyRunner = new PolicyRunner(this.routeScope, this.owner);
      this.moduleRuntime = this.definition.load
        ? new ModuleRuntime(this.routeScope, this.definition.load, exportResolver, this.owner)
        : null;
    } catch (error) {
      this.routeScope.dispose();
      throw error;
    }

    this.unsubscribeModule = this.moduleRuntime?.subscribe(() => this.emit()) ?? null;
  }

  getSnapshot(): RouteRuntimeSnapshot {
    if (this.refreshBoundary !== null) {
      return this.refreshBoundary;
    }

    if (this.snapshotState === this.state) {
      return this.snapshot;
    }

    this.snapshotState = this.state;

    switch (this.state.phase) {
      case 'failed':
        this.snapshot = { error: this.state.error, phase: 'failed' };
        break;
      case 'forbidden':
      case 'not-found':
        this.snapshot = { error: null, phase: this.state.phase };
        break;
      case 'pending':
        this.snapshot = { error: this.state.failure?.error ?? null, phase: 'pending' };
        break;
      default:
        this.snapshot = ROUTE_RUNTIME_SNAPSHOTS[this.state.phase];
    }

    return this.snapshot;
  }

  getModuleRuntime(): ModuleRuntime<TPresentation> {
    if (!this.moduleRuntime) {
      throw new Error('Runtime модуля маршрута недоступен.');
    }

    return this.moduleRuntime;
  }

  getModuleRuntimeOrNull(): ModuleRuntime<TPresentation> | null {
    return this.moduleRuntime;
  }

  getRouteScope(): RuntimeScope {
    return this.routeScope;
  }

  getNavigationBlockerBoundary(): NavigationBlockerBoundary {
    return this.navigationBlockerBoundary;
  }

  getBoundaryModuleOrNull(): ActiveModuleRuntime<TPresentation> | null {
    return this.moduleRuntime?.getBoundaryModuleOrNull() ?? null;
  }

  getPresentationModuleOrNull(): ActiveModuleRuntime<TPresentation> | null {
    return this.moduleRuntime?.getPresentationModuleOrNull() ?? null;
  }

  getParams(): Readonly<Record<string, unknown>> {
    switch (this.state.phase) {
      case 'active':
      case 'retained':
      case 'failed':
      case 'forbidden':
      case 'not-found':
      case 'pending':
      case 'preparing':
        return this.state.params;
      case 'disposed':
      case 'empty':
        throw new Error('Параметры runtime маршрута недоступны.');
    }
  }

  stageLocation(params: Readonly<Record<string, unknown>>, state: unknown): void {
    this.assertNotDisposed();
    this.locationService?.stage(params, state);
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    return this.getModuleRuntime().getController(controllerToken);
  }

  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue {
    return this.getModuleRuntime().getLoaderData<TValue>(controllerToken);
  }

  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>): ModuleRuntimeActionState<TResult> {
    return this.getModuleRuntime().getActionState<TResult>(controllerToken);
  }

  getRevalidateState(controllerToken?: DependencyToken<unknown>): ModuleRuntimeRevalidateState {
    return this.moduleRuntime?.getRevalidateState(controllerToken) ?? EMPTY_REVALIDATE_STATE;
  }

  getRevalidateRevision(): number {
    return this.moduleRuntime?.getRevalidateRevision() ?? 0;
  }

  executePolicyBoundary(
    boundary: RoutePolicyBoundary,
    context: RouteRuntimeContextInterface,
  ): Promise<PolicyBoundaryDecision> {
    this.assertNotDisposed();

    return this.policyRunner.execute(this.definition[boundary], copyPolicyContext(context));
  }

  testCanMatch(context: RouteRuntimeContextInterface): Promise<boolean> {
    this.assertNotDisposed();

    return this.policyRunner.test(this.definition.canMatch, copyPolicyContext(context));
  }

  prepare(context: RouteRuntimePrepareContext): Promise<void> {
    if (this.preparePromise) {
      return this.preparePromise;
    }

    if (this.state.phase === 'pending') {
      return this.state.failure === null ? Promise.resolve() : Promise.reject(this.state.failure.error);
    }

    if (this.state.phase !== 'empty') {
      return Promise.reject(new Error('Runtime маршрута нельзя подготовить в текущем состоянии.'));
    }

    const operationId = ++this.operationCounter;
    const params = Object.freeze({ ...context.params });
    const abortController = new AbortController();
    const abort = (): void => abortController.abort(context.signal.reason);

    if (context.signal.aborted) {
      abort();
    } else {
      context.signal.addEventListener('abort', abort, { once: true });
    }

    this.prepareAbortController = abortController;
    this.state = { params, phase: 'preparing' };
    this.emit();

    const promise = this.runPrepare(params, abortController, operationId).finally(() => {
      context.signal.removeEventListener('abort', abort);

      if (this.prepareAbortController === abortController) {
        this.prepareAbortController = null;
      }

      if (this.preparePromise === promise) {
        this.preparePromise = null;
      }
    });

    this.preparePromise = promise;

    return promise;
  }

  commit(): void {
    if (this.state.phase !== 'pending') {
      return;
    }

    const { failure, params } = this.state;

    if (failure === null) this.providerPipeline?.commit();
    this.moduleRuntime?.commit();
    this.state = failure === null ? { params, phase: 'active' } : { error: failure.error, params, phase: 'failed' };
    this.emit();
  }

  commitBoundary(
    phase: RouteRuntimeBoundaryPhase,
    error: unknown | null,
    params: Readonly<Record<string, unknown>>,
  ): void {
    if (this.state.phase !== 'empty') {
      throw new Error('Route boundary нельзя зафиксировать в текущем состоянии runtime.');
    }

    const committedParams = Object.freeze({ ...params });

    this.state =
      phase === 'failed' ? { error, params: committedParams, phase: 'failed' } : { params: committedParams, phase };
    this.emit();
  }

  getPendingFailureOrNull(): RouteRuntimePendingFailure | null {
    return this.state.phase === 'pending' ? this.state.failure : null;
  }

  reportBoundaryFailure(error: unknown): Promise<void> {
    return this.reportRouteFailure(error, 'policy');
  }

  reportActionFailure(error: unknown): Promise<void> {
    return reportRuntimeFailure(
      this.routeScope.get(RuntimeFailureReporterInterface),
      captureRuntimeFailure(error, this.createRuntimeSource('action')),
      this.owner,
      'action.failed',
      'active',
    );
  }

  setRefreshBoundary(phase: RouteRuntimeBoundaryPhase, error: unknown | null): void {
    this.assertActive();
    this.refreshBoundary = phase === 'failed' ? { error, phase } : { error: null, phase };
    this.emit();
  }

  clearRefreshBoundary(): void {
    if (this.refreshBoundary === null) {
      return;
    }

    this.refreshBoundary = null;
    this.emit();
  }

  isRefreshable(): boolean {
    return (
      this.state.phase === 'active' &&
      (this.moduleRuntime === null || this.moduleRuntime.getSnapshot().phase === 'active')
    );
  }

  isReusableForNavigation(): boolean {
    return this.refreshBoundary === null && this.isRefreshable();
  }

  async retain(): Promise<void> {
    if (this.state.phase === 'retained') return;

    if (this.state.phase !== 'active') {
      throw new Error('Retain допустим только для активного runtime маршрута.');
    }

    const params = this.state.params;

    await Promise.all([this.providerPipeline?.deactivate(), this.moduleRuntime?.retain()]);
    this.state = { params, phase: 'retained' };
    this.emit();
  }

  async focus(signal: AbortSignal): Promise<void> {
    if (this.state.phase === 'active') return;

    if (this.state.phase !== 'retained') {
      throw new Error('Focus допустим только для retained runtime маршрута.');
    }

    const params = this.state.params;

    await Promise.all([
      this.providerPipeline?.focus({ scope: this.routeScope, signal }),
      this.moduleRuntime?.focus(signal),
    ]);
    this.state = { params, phase: 'active' };
    this.emit();
  }

  discardPending(): void {
    if (this.state.phase !== 'pending' && this.state.phase !== 'preparing') {
      return;
    }

    this.operationCounter += 1;
    this.prepareAbortController?.abort(new Error('Подготовка runtime маршрута отменена.'));
    this.moduleRuntime?.discardPending();
    this.locationService?.discardPending();
    this.state = { phase: 'empty' };
    this.emit();
  }

  action<TPayload>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    context: RouteRuntimeActionContext = { signal: this.lifecycleAbortController.signal },
  ): Promise<unknown> {
    this.assertActive();

    const execute = (): Promise<unknown> =>
      this.getModuleRuntime().action(controllerToken, payload, {
        params: this.getParams(),
        props: EMPTY_PROPS,
        signal: context.signal,
      });

    return this.callbacks.executeAction?.({ execute, runtime: this, signal: context.signal }) ?? execute();
  }

  invoke<TValue>(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): TValue {
    this.assertActive();

    return this.getModuleRuntime().invoke<TValue>(controllerToken, method, args);
  }

  revalidate(options: RouteRuntimeRevalidateOptions = {}): Promise<void> {
    this.assertActive();

    if (!this.moduleRuntime) {
      const params = this.getParams();
      const signal = options.signal ?? this.lifecycleAbortController.signal;
      const pipeline = this.providerPipeline;

      if (!pipeline?.isCommitted) return Promise.resolve();

      return (async () => {
        try {
          await pipeline.revalidate(createProviderContext(this.routeScope, params, signal));
        } catch (error) {
          if (!signal.aborted) {
            this.setRefreshBoundary('failed', error);
            await this.reportRevalidateFailure(error);
          }

          throw error;
        }
      })();
    }

    const params = this.getParams();
    const moduleOptions: ModuleRuntimeRevalidateOptions = {
      controllerToken: options.controllerToken,
      lifecycle: {
        revalidate: (signal) =>
          this.providerPipeline?.isCommitted
            ? this.providerPipeline.revalidate(createProviderContext(this.routeScope, params, signal))
            : undefined,
      },
      params,
      props: EMPTY_PROPS,
      signal: options.signal,
    };

    return this.moduleRuntime.revalidate(moduleOptions);
  }

  async failRender(error: unknown): Promise<void> {
    if (this.state.phase === 'disposed' || this.state.phase === 'failed') {
      return;
    }

    if (
      this.state.phase === 'empty' ||
      this.state.phase === 'forbidden' ||
      this.state.phase === 'not-found' ||
      this.state.phase === 'preparing'
    ) {
      return;
    }

    const params = this.state.params;

    this.operationCounter += 1;
    this.prepareAbortController?.abort(error);
    this.state = { error, params, phase: 'failed' };
    this.emit();
    await this.moduleRuntime?.dispose();
    await this.callbacks.onRenderFailure?.(this, error);
    await this.reportRouteFailure(error, 'render');
  }

  subscribe(listener: RouteRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise;
    }

    if (this.state.phase === 'disposed') {
      return Promise.resolve();
    }

    const promise = this.runDispose().finally(() => {
      if (this.disposePromise === promise) {
        this.disposePromise = null;
      }
    });

    this.disposePromise = promise;

    return promise;
  }

  private async runPrepare(
    params: Readonly<Record<string, unknown>>,
    abortController: AbortController,
    operationId: number,
  ): Promise<void> {
    const result = await executeRuntimeOperation({
      guard: this.createPreparationGuard(),
      operation: async () => {
        throwIfPreparationAborted(abortController.signal);

        const providerContext = createProviderContext(this.routeScope, params, abortController.signal);
        const providerPipeline = this.getOrCreateProviderPipeline();

        await providerPipeline.initialize(providerContext);
        throwIfPreparationAborted(abortController.signal);

        await Promise.all([
          providerPipeline.prepare(providerContext),
          this.moduleRuntime?.load({
            params: { ...params },
            props: EMPTY_PROPS,
            signal: abortController.signal,
          }),
        ]);

        throwIfPreparationAborted(abortController.signal);
        await providerPipeline.activate(providerContext);
        throwIfPreparationAborted(abortController.signal);
      },
      signal: abortController.signal,
      source: this.createRuntimeSource('prepare'),
    });

    if (operationId !== this.operationCounter || this.state.phase === 'disposed') {
      return;
    }

    await this.applyPrepareResult(result, params, abortController);
  }

  private async applyPrepareResult(
    result: RuntimeOperationResult<void>,
    params: Readonly<Record<string, unknown>>,
    abortController: AbortController,
  ): Promise<void> {
    switch (result.type) {
      case 'completed':
        this.state = { failure: null, params, phase: 'pending' };
        this.emit();
        return;
      case 'interrupted':
        abortController.abort(result.cause);
        this.moduleRuntime?.discardPending();
        await this.disposeProviderPipeline();
        this.state = { phase: 'empty' };
        this.emit();
        return;
      case 'rejected':
        this.moduleRuntime?.discardPending();
        await this.disposeProviderPipeline();
        this.state = { failure: { error: result.error }, params, phase: 'pending' };
        this.emit();
        return;
      case 'failed':
      case 'escalated':
        this.moduleRuntime?.discardPending();
        await this.disposeProviderPipeline();
        this.state = { failure: { error: result.failure.cause }, params, phase: 'pending' };
        this.emit();
        await this.reportActivationFailure(result.failure);
        return;
    }
  }

  private async runDispose(): Promise<void> {
    this.operationCounter += 1;
    this.lifecycleAbortController.abort(new Error('Runtime маршрута освобождён.'));
    this.prepareAbortController?.abort(new Error('Runtime маршрута освобождён.'));
    this.refreshBoundary = null;
    this.state = { phase: 'disposed' };
    this.emit();

    try {
      await this.disposeProviderPipeline();
      await this.moduleRuntime?.dispose();
    } finally {
      this.unsubscribeModule?.();
      this.unsubscribeModule = null;
      this.locationService?.dispose();
      this.routeScope.dispose();
      this.listeners.clear();
    }
  }

  private createPreparationGuard() {
    if (!this.routeScope.has(SessionRuntimeStateInterface)) {
      return null;
    }

    return createRuntimeRevisionGuard(this.routeScope.get(SessionRuntimeStateInterface));
  }

  private createRuntimeSource(operation: string): RuntimeFailureSource {
    return {
      operation,
      owner: this.owner,
      participant: { kind: 'runtime' },
    };
  }

  private getOrCreateProviderPipeline(): ProviderPipeline {
    this.providerPipeline ??= new ProviderPipeline(this.routeScope, this.definition.providers, this.owner);

    return this.providerPipeline;
  }

  private async disposeProviderPipeline(): Promise<void> {
    const pipeline = this.providerPipeline;

    this.providerPipeline = null;
    await pipeline?.dispose();
  }

  private async reportRouteFailure(error: unknown, operation: string): Promise<void> {
    await reportRuntimeFailure(
      this.routeScope.get(RuntimeFailureReporterInterface),
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

  private async reportRevalidateFailure(error: unknown): Promise<void> {
    await reportRuntimeFailure(
      this.routeScope.get(RuntimeFailureReporterInterface),
      captureRuntimeFailure(error, this.createRuntimeSource('revalidate')),
      this.owner,
      'revalidate.failed',
      'failed',
    );
  }

  private async reportActivationFailure(failure: RuntimeFailure): Promise<void> {
    const disposition: RuntimeFailureDisposition =
      failure.source.owner.kind === 'module' ? 'module.activation-failed' : 'route.activation-failed';

    await reportRuntimeFailure(
      this.routeScope.get(RuntimeFailureReporterInterface),
      failure,
      this.owner,
      disposition,
      'failed',
    );
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private assertActive(): void {
    if (this.state.phase !== 'active') {
      throw new Error('Runtime маршрута не активен.');
    }
  }

  private assertNotDisposed(): void {
    if (this.state.phase === 'disposed') {
      throw new Error('Runtime маршрута уже освобождён.');
    }
  }
}

const EMPTY_PROPS = Object.freeze({});

const EMPTY_REVALIDATE_STATE: ModuleRuntimeRevalidateState = {
  error: undefined,
  inProcess: false,
};

const ROUTE_RUNTIME_SNAPSHOTS: Record<
  Exclude<RouteRuntimePhase, 'failed' | 'forbidden' | 'not-found' | 'pending'>,
  RouteRuntimeSnapshot
> = {
  active: { error: null, phase: 'active' },
  disposed: { error: null, phase: 'disposed' },
  empty: { error: null, phase: 'empty' },
  preparing: { error: null, phase: 'preparing' },
  retained: { error: null, phase: 'retained' },
};

const createProviderContext = (
  scope: RuntimeScope,
  params: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
) => ({
  params,
  props: EMPTY_PROPS,
  scope,
  signal,
});

const assertRouteId = (routeId: string): void => {
  if (routeId.length === 0 || routeId.trim() !== routeId) {
    throw new Error('Route runtime id должен быть непустым значением без пробелов по краям.');
  }
};

const throwIfPreparationAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new Error('Подготовка runtime маршрута была прервана.');
  }
};

const copyPolicyContext = (context: RouteRuntimeContextInterface): RouteRuntimeContextInterface => ({
  app: context.app,
  params: Object.freeze({ ...context.params }),
  session: context.session,
  signal: context.signal,
});
