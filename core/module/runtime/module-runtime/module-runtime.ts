import type { ModuleRuntimeDefinition } from '../../contract/module-runtime-definition';
import {
  getControllerLoaderData,
  mergeControllerLoaderData,
  type ControllerLoaderData,
} from '../../../controller/data/controller-loader-data';
import { invokeControllerMethod } from '../../../controller/runtime/controller-method-invoker';
import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { ApplicationReportDispatcherInterface } from '../../../application/reporting/application-report';
import type { DependencyToken } from '../../../di/token/dependency-token';
import type { ModuleExportResolverInterface, ModuleExports } from '../../resolution/module-export-resolver';
import {
  createLoadedModuleRuntime,
  disposeLoadedModuleRuntime,
  executeLoadedModuleAction,
  loadLoadedModuleRuntime,
  type LoadedModuleControllerContext,
  type LoadedModuleRuntime,
} from '../loaded-module-runtime';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import type { NavigationOperation } from '../../../router/runtime/navigation-operation';
import {
  reportRuntimeFailure,
  type RuntimeFailure,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../../runtime/failure/runtime-failure';
import { captureRuntimeFailure, throwRuntimeOperationError } from '../../../runtime/failure/runtime-failure-signal';
import {
  createRuntimeCompletionRevisionGuard,
  createRuntimeRevisionGuard,
  executeRuntimeOperation,
  executeRuntimeParticipant,
  type RuntimeOperationGuard,
  type RuntimeOperationResult,
} from '../../../runtime/operation/runtime-operation';
import { ModuleScope } from '../../../runtime/scope/kind/module-scope';
import { RuntimeOperationCoordinator } from '../../../runtime/operation/runtime-operation-coordinator';
import {
  createRuntimeException,
  createRuntimeExceptionSignal,
  isRuntimeExceptionSignal,
  type RuntimeException,
  type RuntimeExceptionRecoveryOperations,
} from '../../../runtime/exception/runtime-exception';
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';
import { RuntimeRevalidateService } from '../../../revalidate/runtime/revalidate-service';
import {
  LoaderTransactionService,
  commitLoaderData,
  discardLoaderData,
  settleLoaderTasks,
} from '../../../controller/runtime/loader-transaction';
import { resolveRuntimeRevalidateState } from '../../../revalidate/runtime/revalidate-state';
import {
  isLoaderFailure,
  RuntimeRetryOperations,
  type RuntimeRetryOperation,
} from '../../../runtime/operation/runtime-retry';
import { WidgetRuntimeRegistry } from '../../../widget/runtime/widget-runtime-registry';

export type ModuleRuntimeLoader = () => Promise<ModuleExports>;

export type ModuleRuntimePhase = 'active' | 'empty' | 'failed' | 'loading' | 'pending' | 'retained';

export interface ModuleRuntimeSnapshot {
  readonly exception: RuntimeException | null;
  readonly phase: ModuleRuntimePhase;
}

export interface ModuleRuntimeActionState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

export interface ActiveModuleRuntime<TPresentation = unknown> extends LoadedModuleRuntime<TPresentation> {
  loaderParams: Record<string, unknown>;
  loaderProps: object;
}

export interface ModuleRuntimeRevalidateOptions {
  readonly restartCollections?: boolean;
  readonly navigationOperation?: NavigationOperation;
  readonly controllerToken?: DependencyToken<unknown>;
  readonly lifecycle?: ModuleRuntimeRevalidateLifecycle;
  readonly params?: Record<string, unknown>;
  readonly props?: object;
  readonly signal?: AbortSignal;
}

export interface ModuleRuntimeRevalidateLifecycle {
  revalidate?(signal: AbortSignal): void | Promise<void>;
}

export interface ModuleRuntimeRevalidateState {
  readonly error: unknown;
  readonly inProcess: boolean;
}

type ModuleRuntimeListener = () => void;

type ModuleRuntimeState<TPresentation> =
  | {
      readonly phase: 'empty';
    }
  | {
      readonly active: ActiveModuleRuntime<TPresentation> | null;
      readonly phase: 'loading';
      readonly promise: Promise<ActiveModuleRuntime<TPresentation>>;
      readonly sessionId: number;
    }
  | {
      readonly active: ActiveModuleRuntime<TPresentation> | null;
      readonly pending: ActiveModuleRuntime<TPresentation>;
      readonly phase: 'pending';
      readonly sessionId: number;
    }
  | {
      readonly active: ActiveModuleRuntime<TPresentation>;
      readonly phase: 'active';
    }
  | {
      readonly active: ActiveModuleRuntime<TPresentation>;
      readonly phase: 'retained';
    }
  | {
      readonly active: ActiveModuleRuntime<TPresentation>;
      readonly phase: 'failed';
      readonly snapshot: ModuleRuntimeSnapshot;
    };

interface ModuleCleanupTask<TPresentation> {
  readonly moduleRuntime: ActiveModuleRuntime<TPresentation>;
  readonly promise: Promise<void>;
}

interface ModuleRevalidateTask<TPresentation> {
  readonly result: Promise<boolean>;
  readonly controllerToken: DependencyToken<unknown> | undefined;
  readonly moduleRuntime: ActiveModuleRuntime<TPresentation>;
  readonly promise: Promise<void>;
}

export class ModuleRuntime<TPresentation = unknown> {
  private readonly actionStates = new Map<DependencyToken<unknown>, ModuleRuntimeActionState>();
  private readonly activeActions = new Map<DependencyToken<unknown>, symbol>();
  private readonly cleanupTasks = new Set<ModuleCleanupTask<TPresentation>>();
  private readonly disposedModules = new WeakSet<LoadedModuleRuntime<TPresentation>>();
  private readonly listeners = new Set<ModuleRuntimeListener>();
  private readonly revalidateStates = new Map<DependencyToken<unknown>, ModuleRuntimeRevalidateState>();
  private readonly revalidateTasks = new Set<ModuleRevalidateTask<TPresentation>>();
  private failedLoad: {
    readonly runtime: ActiveModuleRuntime<TPresentation>;
    readonly args: LoadedModuleControllerContext;
  } | null = null;
  private invocationRevision = 0;
  private readonly retryOperations = new RuntimeRetryOperations();
  private retryPresentation: ModuleRuntimeSnapshot | null = null;
  private retryAbortController: AbortController | null = null;
  private loadPromise: Promise<ControllerLoaderData> | null = null;
  private revalidateAbortController: AbortController | null = null;
  private revalidateOperationCounter = 0;
  private revalidateQueue: Promise<void> = Promise.resolve();
  private revalidateRevision = 0;
  private revalidateState: ModuleRuntimeRevalidateState = DEFAULT_REVALIDATE_STATE;
  private state: ModuleRuntimeState<TPresentation> = { phase: 'empty' };
  private sessionCounter = 0;

  constructor(
    private readonly ownerScope: RuntimeScope,
    private readonly loadModule: ModuleRuntimeLoader,
    private readonly exportResolver: ModuleExportResolverInterface<TPresentation>,
    private readonly routeOwner: RuntimeOwner,
    private readonly recovery: RuntimeExceptionRecoveryOperations = {},
    private readonly executeRetry: (
      execute: () => Promise<void>,
      kind: RuntimeRetryOperation['kind'],
    ) => Promise<void> = async (execute) => execute(),
  ) {}

  async activate(signal: AbortSignal): Promise<ActiveModuleRuntime<TPresentation>> {
    const activeModule = this.getActiveModuleOrNull();

    if (activeModule) {
      return activeModule;
    }

    if (this.state.phase === 'pending') {
      return this.state.pending;
    }

    if (this.state.phase === 'loading') {
      return this.state.promise;
    }

    const sessionId = ++this.sessionCounter;
    const active = activeModule;

    const abortPending = (): void => {
      if (!this.isSessionActive(sessionId)) {
        return;
      }

      if (this.state.phase === 'loading' && this.state.sessionId === sessionId) {
        this.state = active ? { active, phase: 'active' } : { phase: 'empty' };
        this.emit();
        return;
      }

      this.disposePending();
    };

    signal.addEventListener('abort', abortPending, { once: true });

    const promise = this.activateModule(signal)
      .then((loadedModule) => {
        if (signal.aborted || !this.isSessionActive(sessionId)) {
          this.scheduleModuleDispose(loadedModule);
          throw new Error('Активация модуля была прервана.');
        }

        this.state = {
          active,
          pending: loadedModule,
          phase: 'pending',
          sessionId,
        };
        this.emit();

        return loadedModule;
      })
      .catch((error) => {
        if (this.state.phase === 'loading' && this.state.sessionId === sessionId) {
          this.state = active ? { active, phase: 'active' } : { phase: 'empty' };
          this.emit();
        }

        throw error;
      })
      .finally(() => {
        signal.removeEventListener('abort', abortPending);

        if (this.state.phase === 'loading' && this.state.sessionId === sessionId) {
          this.state = active ? { active, phase: 'active' } : { phase: 'empty' };
          this.emit();
        }
      });

    this.state = {
      active,
      phase: 'loading',
      promise,
      sessionId,
    };
    this.emit();

    return promise;
  }

  getActiveModule(): ActiveModuleRuntime<TPresentation> {
    const activeModule = this.getActiveModuleOrNull();

    if (!activeModule) {
      throw new Error('Runtime модуля не активен.');
    }

    return activeModule;
  }

  getActiveModuleOrNull(): ActiveModuleRuntime<TPresentation> | null {
    switch (this.state.phase) {
      case 'active':
      case 'failed':
      case 'retained':
        return this.state.active;
      case 'loading':
      case 'pending':
        return this.state.active;
      case 'empty':
        return null;
    }
  }

  getBoundaryModuleOrNull(): ActiveModuleRuntime<TPresentation> | null {
    return this.state.phase === 'pending' ? this.state.pending : this.getActiveModuleOrNull();
  }

  getPendingModuleOrNull(): ActiveModuleRuntime<TPresentation> | null {
    return this.state.phase === 'pending' ? this.state.pending : null;
  }

  getPresentationModuleOrNull(): ActiveModuleRuntime<TPresentation> | null {
    return this.getActiveModuleOrNull() ?? this.getPendingModuleOrNull();
  }

  get hasRetryableLoad(): boolean {
    return (
      this.failedLoad !== null &&
      this.getBoundaryModuleOrNull() === this.failedLoad.runtime &&
      this.failedLoad.runtime.providerPipeline.hasPendingPreparation
    );
  }

  getSnapshot(): ModuleRuntimeSnapshot {
    if (this.state.phase !== 'failed' && this.retryPresentation) return this.retryPresentation;
    return this.state.phase === 'failed' ? this.state.snapshot : MODULE_RUNTIME_SNAPSHOTS[this.state.phase];
  }

  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue {
    const moduleRuntime = this.getPresentationModuleOrNull();

    if (!moduleRuntime) {
      throw new Error('Данные загрузчика модуля недоступны.');
    }

    return getControllerLoaderData<TValue>(moduleRuntime.loaderData, controllerToken);
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    const controller = this.getPresentationModuleOrNull()?.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер модуля недоступен.');
    }

    return controller as TController;
  }

  getParams(): Readonly<Record<string, unknown>> {
    const moduleRuntime = this.getPresentationModuleOrNull();

    if (!moduleRuntime) {
      throw new Error('Параметры модуля недоступны.');
    }

    return moduleRuntime.loaderParams;
  }

  invoke<TValue>(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): TValue {
    const moduleRuntime = this.getOperationalModule();
    const controller = moduleRuntime.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер модуля недоступен.');
    }

    const revision = this.invocationRevision;
    const source = {
      operation: `controller.${String(method)}`,
      owner: moduleRuntime.owner,
      participant: { kind: 'controller', token: controllerToken } as const,
    };

    try {
      const value = this.ownerScope.get(RuntimeOperationCoordinator).run(() =>
        invokeControllerMethod<TValue>({
          args,
          controller,
          method,
          owner: moduleRuntime.owner,
          token: controllerToken,
        }),
      );

      if (isPromiseLike(value)) {
        return value.catch((error) => {
          return this.handleControllerInvocationError(error, moduleRuntime, revision, source, {
            kind: 'controller',
            run: () => this.invoke(controllerToken, method, args),
          });
        }) as TValue;
      }

      return value;
    } catch (error) {
      return this.handleControllerInvocationError(error, moduleRuntime, revision, source, {
        kind: 'controller',
        run: () => this.invoke(controllerToken, method, args),
      });
    }
  }

  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>): ModuleRuntimeActionState<TResult> {
    return (this.actionStates.get(controllerToken) ?? DEFAULT_ACTION_STATE) as ModuleRuntimeActionState<TResult>;
  }

  action<TPayload>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    args: LoadedModuleControllerContext,
  ): Promise<unknown> {
    return this.ownerScope
      .get(RuntimeOperationCoordinator)
      .run(() => this.executeAction(controllerToken, payload, args));
  }

  private async executeAction<TPayload>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    args: LoadedModuleControllerContext,
  ): Promise<unknown> {
    const activeModule = this.getOperationalModule();

    if (this.activeActions.has(controllerToken)) {
      throw new Error('Действие контроллера уже выполняется.');
    }

    const actionId = Symbol('action');
    this.activeActions.set(controllerToken, actionId);
    this.setActionState(controllerToken, {
      data: undefined,
      error: undefined,
      inProcess: true,
    });

    try {
      const result = await executeRuntimeOperation({
        guard: this.createCompletionGuard(),
        operation: async () => {
          throwIfActionAborted(args.signal);
          const value = await executeLoadedModuleAction(activeModule, controllerToken, payload, args);
          throwIfActionAborted(args.signal);
          return value;
        },
        signal: args.signal,
        source: {
          operation: 'action',
          owner: activeModule.owner,
          participant: { kind: 'controller', token: controllerToken },
        },
      });

      if (!this.isActiveModule(activeModule) || this.activeActions.get(controllerToken) !== actionId) {
        return undefined;
      }

      switch (result.type) {
        case 'completed':
          this.setActionState(controllerToken, {
            data: result.value,
            error: undefined,
            inProcess: false,
          });
          return result.value;
        case 'interrupted':
          this.setActionState(controllerToken, DEFAULT_ACTION_STATE);
          return undefined;
        case 'rejected':
          this.setActionState(controllerToken, {
            data: undefined,
            error: result.error,
            inProcess: false,
          });
          return undefined;
        case 'failed':
          this.setActionState(controllerToken, {
            data: undefined,
            error: result.failure.cause,
            inProcess: false,
          });
          await reportRuntimeFailure(
            this.ownerScope.get(ApplicationReportDispatcherInterface),
            result.failure,
            activeModule.owner,
            'action.failed',
            'active',
          );
          return undefined;
        case 'escalated':
          this.transitionToFailed(activeModule, result.failure, {
            kind: 'action',
            run: async (signal) => {
              await this.action(controllerToken, payload, { ...args, signal });
              const error = this.getActionState(controllerToken).error;
              if (error !== undefined) throw error;
            },
          });
          await reportRuntimeFailure(
            this.ownerScope.get(ApplicationReportDispatcherInterface),
            result.failure,
            activeModule.owner,
            'module.failed',
            'failed',
          );
          return undefined;
      }
    } finally {
      if (this.activeActions.get(controllerToken) === actionId) this.activeActions.delete(controllerToken);

      if (this.isRetainedModule(activeModule) && this.getActionState(controllerToken).inProcess) {
        this.setActionState(controllerToken, DEFAULT_ACTION_STATE);
      }
    }
  }

  getRevalidateState(controllerToken?: DependencyToken<unknown>): ModuleRuntimeRevalidateState {
    return resolveRuntimeRevalidateState(controllerToken, this.revalidateState, this.revalidateStates);
  }

  getRevalidateRevision(): number {
    return this.revalidateRevision;
  }

  revalidate(options: ModuleRuntimeRevalidateOptions = {}): Promise<void> {
    if (this.state.phase !== 'active') {
      return Promise.reject(new Error('Runtime модуля не готов.'));
    }

    const moduleRuntime = this.state.active;
    if (options.signal?.aborted) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise.then(() => undefined);

    const requestSignal = moduleRuntime.scope.getRequestSignal();
    const operationId = this.revalidateOperationCounter;
    const operationGuard = this.createCompletionGuard();

    const pending = [...this.revalidateTasks].filter(
      (task) =>
        task.moduleRuntime === moduleRuntime &&
        (options.controllerToken === undefined ||
          options.restartCollections ||
          task.controllerToken === undefined ||
          task.controllerToken === options.controllerToken),
    );
    if (options.restartCollections) {
      moduleRuntime.scope.get(LoaderTransactionService).restartCollections();
    }

    if (pending.length > 0) {
      return settleLoaderTasks(pending.map((task) => task.result)).then((results) => {
        if (
          (!options.restartCollections && results.every(Boolean)) ||
          options.signal?.aborted ||
          requestSignal.aborted ||
          operationId !== this.revalidateOperationCounter ||
          operationGuard?.isInterrupted() ||
          !this.isActiveModule(moduleRuntime)
        )
          return;

        const remaining =
          !options.restartCollections && options.controllerToken === undefined && results.some(Boolean)
            ? pending.filter((_, index) => !results[index]).map((task) => task.controllerToken)
            : [options.controllerToken];
        return settleLoaderTasks(
          remaining.map((controllerToken) =>
            this.revalidate({ ...options, controllerToken, restartCollections: false }),
          ),
        ).then(() => undefined);
      });
    }

    const result = this.revalidateQueue.then(() => {
      if (operationId !== this.revalidateOperationCounter || requestSignal.aborted) return false;
      return this.executeRevalidate(moduleRuntime, options, operationId, operationGuard, () =>
        this.revalidateTasks.delete(task),
      );
    });
    const promise = result.then(() => undefined);
    const task: ModuleRevalidateTask<TPresentation> = {
      result,
      controllerToken: options.controllerToken,
      moduleRuntime,
      promise,
    };

    this.revalidateTasks.add(task);
    this.revalidateQueue = promise.catch(() => undefined);
    void promise.then(
      () => this.revalidateTasks.delete(task),
      () => this.revalidateTasks.delete(task),
    );

    return promise;
  }

  async retain(): Promise<void> {
    if (this.state.phase === 'retained') return;

    if (this.state.phase !== 'active') {
      throw new Error('Retain допустим только для активного runtime модуля.');
    }

    const active = this.state.active;
    const widgetRegistry = active.scope.get(WidgetRuntimeRegistry);

    this.interruptRevalidation();
    widgetRegistry.retainOwner(active.scope);

    try {
      await active.providerPipeline.deactivate();
    } catch (error) {
      widgetRegistry.focusOwner(active.scope);
      throw error;
    }

    this.state = { active, phase: 'retained' };
    this.emit();
  }

  async focus(signal: AbortSignal): Promise<void> {
    if (this.state.phase === 'active') return;

    if (this.state.phase !== 'retained') {
      throw new Error('Focus допустим только для retained runtime модуля.');
    }

    const active = this.state.active;

    active.scope.resumeRequests();
    try {
      await active.providerPipeline.focus({ scope: active.scope, signal });
    } catch (error) {
      active.scope.suspendRequests();
      throw error;
    }
    active.scope.get(WidgetRuntimeRegistry).focusOwner(active.scope);
    this.state = { active, phase: 'active' };
    this.emit();
  }

  load(args: LoadedModuleControllerContext, navigationOperation?: NavigationOperation): Promise<ControllerLoaderData> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    const promise = this.runLoad(args, navigationOperation).finally(() => {
      if (this.loadPromise === promise) {
        this.loadPromise = null;
      }
    });

    this.loadPromise = promise;

    return promise;
  }

  subscribe(listener: ModuleRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async failRender(error: unknown): Promise<void> {
    const moduleRuntime = this.getActiveModuleOrNull();
    const failure = moduleRuntime
      ? captureRuntimeFailure(error, {
          operation: 'render',
          owner: moduleRuntime.owner,
          participant: { kind: 'runtime' },
        })
      : null;

    if (!moduleRuntime || !failure || !this.transitionToFailed(moduleRuntime, failure)) {
      return;
    }

    moduleRuntime.resources.beginRelease();
    await reportRuntimeFailure(
      this.ownerScope.get(ApplicationReportDispatcherInterface),
      failure,
      moduleRuntime.owner,
      'module.failed',
      'failed',
    );
    this.scheduleModuleDispose(moduleRuntime);
    await this.waitForCleanup();
  }

  commit(): void {
    if (this.state.phase !== 'pending') {
      return;
    }

    const activeModule = this.state.active;
    const pendingModule = this.state.pending;

    pendingModule.providerPipeline.commit();

    if (activeModule && activeModule !== pendingModule) {
      this.interruptRevalidation();
      this.resetRevalidateState(false);
    }

    this.state = {
      active: pendingModule,
      phase: 'active',
    };
    this.emit();

    if (activeModule && activeModule !== pendingModule) {
      this.scheduleModuleDispose(activeModule);
    }
  }

  discardPending(): void {
    this.disposePending();
  }

  async dispose(): Promise<void> {
    this.invocationRevision++;
    this.retryAbortController?.abort();
    this.retryPresentation = null;
    this.failedLoad = null;
    const activeModule = this.getActiveModuleOrNull();
    const pendingModule = this.getPendingModuleOrNull();
    const loadPromise = this.loadPromise;

    this.interruptRevalidation();
    this.resetRevalidateState(false);
    this.state = { phase: 'empty' };
    this.activeActions.clear();
    this.actionStates.clear();
    this.loadPromise = null;
    this.emit();

    if (pendingModule) {
      this.scheduleModuleDispose(pendingModule);
    }

    if (activeModule && activeModule !== pendingModule) {
      this.scheduleModuleDispose(activeModule);
    }

    if (loadPromise) {
      await Promise.allSettled([loadPromise]);
    }

    await this.waitForCleanup();
  }

  private async activateModule(signal: AbortSignal): Promise<ActiveModuleRuntime<TPresentation>> {
    const moduleExports = await executeRuntimeParticipant(
      {
        operation: 'load-module',
        owner: this.routeOwner,
        participant: { kind: 'runtime' },
      },
      this.loadModule,
    );

    throwIfAborted(signal);

    const definition = this.exportResolver.resolve(moduleExports);

    throwIfAborted(signal);

    const moduleScope = new ModuleScope(this.ownerScope, (registry) => {
      registry.bind(RevalidateServiceInterface).toConstantValue(
        new RuntimeRevalidateService((controllerToken, options) =>
          this.revalidate({
            controllerToken,
            signal: options?.signal,
          }),
        ),
      );
    });
    const owner = createModuleOwner(definition);

    try {
      const loadedModule = await createLoadedModuleRuntime(moduleScope, definition, owner);

      return {
        ...loadedModule,
        loaderParams: {},
        loaderProps: {},
      };
    } catch (error) {
      moduleScope.dispose();
      throw error;
    }
  }

  private async runLoad(
    args: LoadedModuleControllerContext,
    navigationOperation?: NavigationOperation,
  ): Promise<ControllerLoaderData> {
    const guard = this.ownerScope.has(SessionRuntimeStateInterface)
      ? createRuntimeRevisionGuard(this.ownerScope.get(SessionRuntimeStateInterface))
      : null;
    const moduleRuntime = await this.activate(args.signal);
    args = { ...args, signal: AbortSignal.any([args.signal, moduleRuntime.scope.getRequestSignal()]) };

    try {
      // Cleanup waits for this operation, not for a request suspended by session expiration.
      const result = await executeRuntimeOperation({
        guard,
        operation: () => {
          throwIfAborted(args.signal);
          return loadLoadedModuleRuntime(moduleRuntime, args, {
            abortMessage: 'Активация модуля была прервана.',
            navigationOperation,
          });
        },
        signal: args.signal,
        source: {
          operation: 'load',
          owner: moduleRuntime.owner,
          participant: { kind: 'runtime' },
        },
      });

      if (result.type !== 'completed') moduleRuntime.scope.get(LoaderTransactionService).discardCurrent();
      this.failedLoad =
        (result.type === 'failed' || result.type === 'escalated') && isLoaderFailure(result.failure)
          ? { runtime: moduleRuntime, args: { ...args, params: { ...args.params }, props: args.props } }
          : result.type === 'rejected' &&
              result.source.operation === 'loader' &&
              result.source.participant.kind === 'controller'
            ? { runtime: moduleRuntime, args: { ...args, params: { ...args.params }, props: args.props } }
            : null;

      switch (result.type) {
        case 'completed':
          throwIfAborted(args.signal);
          if (this.getBoundaryModuleOrNull() !== moduleRuntime) {
            throw new Error('Runtime загрузки модуля больше не актуален.');
          }
          if (!commitLoaderData(result.value)) throw new Error('Loader result was superseded.');
          moduleRuntime.loaderData = result.value;
          moduleRuntime.loaderParams = args.params;
          moduleRuntime.loaderProps = args.props;
          this.emit();
          return result.value;
        case 'interrupted':
          throw new Error('Активация модуля была прервана.');
        case 'rejected':
          return throwRuntimeOperationError(result.error, result.source);
        case 'failed':
          return throwRuntimeOperationError(result.failure.cause, result.failure.source);
        case 'escalated':
          return throwRuntimeOperationError(createRuntimeExceptionSignal(result.failure.cause), result.failure.source);
      }
    } catch (error) {
      if (args.signal.aborted && this.state.phase === 'pending' && this.state.pending === moduleRuntime) {
        this.disposePending();
      }

      throw error;
    }
  }

  private async executeRevalidate(
    moduleRuntime: ActiveModuleRuntime<TPresentation>,
    options: ModuleRuntimeRevalidateOptions,
    operationId: number,
    operationGuard: RuntimeOperationGuard | null,
    finish: () => void,
  ): Promise<boolean> {
    if (!this.isActiveModule(moduleRuntime)) {
      throw new Error('Runtime модуля не готов.');
    }

    if (options.signal?.aborted || operationGuard?.isInterrupted()) {
      return false;
    }

    const controllerToken = options.controllerToken;
    const abortController = new AbortController();
    const externalSignal = AbortSignal.any([
      moduleRuntime.scope.getRequestSignal(),
      ...(options.signal ? [options.signal] : []),
    ]);
    const abortRevalidate = (): void => {
      abortController.abort();
    };

    if (externalSignal?.aborted) {
      abortController.abort();
    } else {
      externalSignal?.addEventListener('abort', abortRevalidate, { once: true });
    }

    this.revalidateAbortController = abortController;
    this.resetRevalidateState(false);
    this.setRevalidateState(controllerToken, {
      error: undefined,
      inProcess: true,
    });

    const params = options.params ?? moduleRuntime.loaderParams;
    const props = options.props ?? moduleRuntime.loaderProps;

    try {
      const result = await executeRuntimeOperation({
        guard: operationGuard,
        operation: () =>
          loadLoadedModuleRuntime(
            moduleRuntime,
            { params, props, signal: abortController.signal },
            {
              abortMessage: 'Обновление модуля было прервано.',
              navigationOperation: options.navigationOperation,
              controllerToken,
              revalidate: (signal) => options.lifecycle?.revalidate?.(signal),
              setup: false,
            },
          ),
        signal: abortController.signal,
        source: {
          operation: 'revalidate',
          owner: moduleRuntime.owner,
          participant: { kind: 'runtime' },
        },
      });

      if (result.type !== 'completed') finish();
      if (result.type === 'interrupted') abortController.abort();

      if (result.type !== 'completed') moduleRuntime.scope.get(LoaderTransactionService).discardCurrent();

      if (!this.isCurrentRevalidate(operationId, moduleRuntime, abortController)) {
        if (result.type === 'completed') discardLoaderData(result.value);
        if (this.ownsRevalidate(operationId, moduleRuntime, abortController)) {
          this.setRevalidateState(controllerToken, DEFAULT_REVALIDATE_STATE);
        }

        return false;
      }

      const committed = await this.applyRevalidateOperationResult(
        moduleRuntime,
        result,
        controllerToken,
        params,
        props,
        options,
      );

      if (this.ownsRevalidate(operationId, moduleRuntime, abortController)) {
        this.setRevalidateState(controllerToken, DEFAULT_REVALIDATE_STATE);
      }
      return committed;
    } catch (error) {
      if (this.isCurrentRevalidate(operationId, moduleRuntime, abortController)) {
        this.setRevalidateState(controllerToken, {
          error,
          inProcess: false,
        });
      }

      throw error;
    } finally {
      if (this.revalidateAbortController === abortController) {
        this.revalidateAbortController = null;
      }

      externalSignal?.removeEventListener('abort', abortRevalidate);
    }
  }

  private async applyRevalidateOperationResult(
    moduleRuntime: ActiveModuleRuntime<TPresentation>,
    result: RuntimeOperationResult<ControllerLoaderData>,
    controllerToken: DependencyToken<unknown> | undefined,
    params: Record<string, unknown>,
    props: object,
    options: ModuleRuntimeRevalidateOptions,
  ): Promise<boolean> {
    const operation: RuntimeRetryOperation = {
      kind: 'loaders',
      run: (signal) => this.revalidate({ ...options, params, props, signal }),
    };
    if (result.type === 'rejected') this.retryOperations.remember(result.error, operation);
    if (result.type === 'failed') this.retryOperations.remember(result.failure.cause, operation);
    switch (result.type) {
      case 'completed':
        if (!commitLoaderData(result.value)) return false;
        moduleRuntime.loaderData =
          controllerToken === undefined
            ? result.value
            : mergeControllerLoaderData(moduleRuntime.loaderData, result.value);
        moduleRuntime.loaderParams = params;
        moduleRuntime.loaderProps = props;
        this.emit();
        return true;
      case 'interrupted':
        return false;
      case 'rejected':
        throw result.error;
      case 'failed':
        await reportRuntimeFailure(
          this.ownerScope.get(ApplicationReportDispatcherInterface),
          result.failure,
          moduleRuntime.owner,
          'revalidate.failed',
          'active',
        );
        throw result.failure.cause;
      case 'escalated':
        this.transitionToFailed(moduleRuntime, result.failure, {
          kind: 'loaders',
          run: (signal) => this.revalidate({ ...options, params, props, signal }),
        });
        await reportRuntimeFailure(
          this.ownerScope.get(ApplicationReportDispatcherInterface),
          result.failure,
          moduleRuntime.owner,
          'module.failed',
          'failed',
        );
        return false;
    }
  }

  private disposePending(): void {
    if (this.state.phase !== 'pending') {
      return;
    }

    const activeModule = this.state.active;
    const pendingModule = this.state.pending;

    this.state = activeModule ? { active: activeModule, phase: 'active' } : { phase: 'empty' };
    this.emit();
    this.scheduleModuleDispose(pendingModule);
  }

  private isSessionActive(sessionId: number): boolean {
    return (this.state.phase === 'loading' || this.state.phase === 'pending') && this.state.sessionId === sessionId;
  }

  private createCompletionGuard(): RuntimeOperationGuard | null {
    if (!this.ownerScope.has(SessionRuntimeStateInterface)) {
      return null;
    }

    return createRuntimeCompletionRevisionGuard(this.ownerScope.get(SessionRuntimeStateInterface));
  }

  private getOperationalModule(): ActiveModuleRuntime<TPresentation> {
    if (this.state.phase !== 'active') {
      throw new Error('Runtime модуля не готов.');
    }

    return this.state.active;
  }

  private handleControllerInvocationError(
    error: unknown,
    moduleRuntime: ActiveModuleRuntime<TPresentation>,
    revision: number,
    source: RuntimeFailureSource,
    operation: RuntimeRetryOperation,
  ): never {
    if (!isRuntimeExceptionSignal(error)) {
      throw error;
    }

    const failure = captureRuntimeFailure(error, source);

    if (
      revision === this.invocationRevision &&
      this.transitionToFailed(moduleRuntime, failure, this.retryOperations.resolve(failure.cause, operation))
    ) {
      void reportRuntimeFailure(
        this.ownerScope.get(ApplicationReportDispatcherInterface),
        failure,
        moduleRuntime.owner,
        'module.failed',
        'failed',
      );
    }

    throw failure.cause;
  }

  createRenderException(error: unknown): RuntimeException {
    const moduleRuntime = this.getActiveModuleOrNull();
    const owner = moduleRuntime?.owner ?? this.routeOwner;

    return this.createException(
      captureRuntimeFailure(error, {
        operation: 'render',
        owner,
        participant: { kind: 'runtime' },
      }),
      owner,
    );
  }

  private transitionToFailed(
    moduleRuntime: ActiveModuleRuntime<TPresentation>,
    failure: RuntimeFailure,
    operation?: RuntimeRetryOperation,
  ): boolean {
    if (!this.isActiveModule(moduleRuntime)) {
      return false;
    }

    this.invocationRevision++;
    this.interruptRevalidation();
    this.resetRevalidateState(false);
    this.activeActions.clear();
    this.actionStates.clear();
    this.state = {
      active: moduleRuntime,
      phase: 'failed',
      snapshot: {
        exception: this.createException(failure, moduleRuntime.owner, operation),
        phase: 'failed',
      },
    };
    this.emit();

    return true;
  }

  private createException(
    failure: RuntimeFailure,
    owner: RuntimeOwner,
    operation?: RuntimeRetryOperation,
  ): RuntimeException {
    const exception: RuntimeException = createRuntimeException(failure, {
      disposition: 'module.failed',
      owner,
      phase: 'failed',
      recovery: {
        ...this.recovery,
        retry: () => this.executeRetry(() => this.retry(failure, exception, operation), operation?.kind ?? 'render'),
      },
    });
    return exception;
  }

  private async retry(
    failure: RuntimeFailure,
    exception: RuntimeException,
    operation?: RuntimeRetryOperation,
  ): Promise<void> {
    const failed = this.state;
    if (failed.phase !== 'failed' || failed.snapshot.exception !== exception || this.retryAbortController) return;
    const signal = this.ownerScope.getRequestSignal();
    if (signal.aborted) return;
    const abortController = new AbortController();
    this.retryAbortController = abortController;
    const retrySignal = AbortSignal.any([signal, abortController.signal]);
    this.retryPresentation = failed.snapshot;
    let runtime = failed.active;
    try {
      if (operation) {
        this.state = { active: runtime, phase: 'active' };
        await operation.run(retrySignal);
      } else {
        this.scheduleModuleDispose(runtime);
        await this.waitForCleanup();
        if (retrySignal.aborted || this.state !== failed) return;
        this.state = { phase: 'empty' };
        await this.load({ params: { ...runtime.loaderParams }, props: runtime.loaderProps, signal: retrySignal });
        if (retrySignal.aborted) return;
        this.commit();
      }
    } catch (error) {
      if (retrySignal.aborted) return;
      const nextFailure = captureRuntimeFailure(error, failure.source);
      const pending = this.getPendingModuleOrNull();
      let nextOperation = operation;
      if (pending && this.hasRetryableLoad && this.failedLoad) {
        runtime = pending;
        const args = this.failedLoad.args;
        nextOperation = {
          kind: 'loaders',
          run: async (signal) => {
            await this.load({ ...args, signal });
            if (!runtime.providerPipeline.isCommitted) runtime.providerPipeline.commit();
          },
        };
      } else if (!operation) {
        this.discardPending();
      }
      if (this.state.phase !== 'failed') {
        this.state = { active: runtime, phase: 'active' };
        this.transitionToFailed(runtime, nextFailure, nextOperation);
        await reportRuntimeFailure(
          this.ownerScope.get(ApplicationReportDispatcherInterface),
          nextFailure,
          runtime.owner,
          'module.failed',
          'failed',
        );
      }
    } finally {
      if (this.retryAbortController === abortController) {
        this.retryAbortController = null;
        this.retryPresentation = null;
        this.emit();
      }
    }
  }

  private interruptRevalidation(): void {
    this.revalidateAbortController?.abort();
    this.revalidateOperationCounter++;
    this.resetRevalidateState(false);
  }

  private isActiveModule(moduleRuntime: ActiveModuleRuntime<TPresentation>): boolean {
    return this.state.phase === 'active' && this.state.active === moduleRuntime;
  }

  private isRetainedModule(moduleRuntime: ActiveModuleRuntime<TPresentation>): boolean {
    return this.state.phase === 'retained' && this.state.active === moduleRuntime;
  }

  private isCurrentRevalidate(
    operationId: number,
    moduleRuntime: ActiveModuleRuntime<TPresentation>,
    abortController: AbortController,
  ): boolean {
    return (
      this.ownsRevalidate(operationId, moduleRuntime, abortController) &&
      !abortController.signal.aborted &&
      this.isActiveModule(moduleRuntime)
    );
  }

  private ownsRevalidate(
    operationId: number,
    moduleRuntime: ActiveModuleRuntime<TPresentation>,
    abortController: AbortController,
  ): boolean {
    return (
      operationId === this.revalidateOperationCounter &&
      this.revalidateAbortController === abortController &&
      this.getActiveModuleOrNull() === moduleRuntime
    );
  }

  private resetRevalidateState(emit = true): void {
    this.revalidateState = DEFAULT_REVALIDATE_STATE;
    this.revalidateStates.clear();
    this.revalidateRevision++;

    if (emit) this.emit();
  }

  private setRevalidateState(
    controllerToken: DependencyToken<unknown> | undefined,
    state: ModuleRuntimeRevalidateState,
  ): void {
    if (controllerToken === undefined) {
      this.revalidateState = state;
    } else {
      this.revalidateStates.set(controllerToken, state);
    }

    this.revalidateRevision++;
    this.emit();
  }

  private setActionState(controllerToken: DependencyToken<unknown>, state: ModuleRuntimeActionState): void {
    this.actionStates.set(controllerToken, state);
    this.emit();
  }

  private scheduleModuleDispose(moduleRuntime: ActiveModuleRuntime<TPresentation>): void {
    if (this.disposedModules.has(moduleRuntime)) {
      return;
    }

    this.disposedModules.add(moduleRuntime);
    moduleRuntime.resources.beginRelease();
    moduleRuntime.scope.suspendRequests();
    const loadPromise = this.loadPromise;

    const task: ModuleCleanupTask<TPresentation> = {
      moduleRuntime,
      promise: this.waitForModuleRelease(moduleRuntime, loadPromise).then(() =>
        disposeLoadedModuleRuntime(moduleRuntime),
      ),
    };

    this.cleanupTasks.add(task);
    void task.promise.finally(() => {
      this.cleanupTasks.delete(task);
    });
  }

  private async waitForCleanup(): Promise<void> {
    while (this.cleanupTasks.size > 0) {
      await Promise.all([...this.cleanupTasks].map((task) => task.promise));
    }
  }

  private async waitForRevalidations(moduleRuntime: ActiveModuleRuntime<TPresentation>): Promise<void> {
    while (true) {
      const tasks = [...this.revalidateTasks]
        .filter((task) => task.moduleRuntime === moduleRuntime)
        .map((task) => task.promise);

      if (tasks.length === 0) {
        return;
      }

      await Promise.allSettled(tasks);
    }
  }

  private async waitForModuleRelease(
    moduleRuntime: ActiveModuleRuntime<TPresentation>,
    loadPromise: Promise<ControllerLoaderData> | null,
  ): Promise<void> {
    if (loadPromise) {
      await Promise.allSettled([loadPromise]);
    }

    await this.waitForRevalidations(moduleRuntime);
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

const DEFAULT_ACTION_STATE: ModuleRuntimeActionState = {
  data: undefined,
  error: undefined,
  inProcess: false,
};

const DEFAULT_REVALIDATE_STATE: ModuleRuntimeRevalidateState = {
  error: undefined,
  inProcess: false,
};

const MODULE_RUNTIME_SNAPSHOTS: Record<Exclude<ModuleRuntimePhase, 'failed'>, ModuleRuntimeSnapshot> = {
  active: { exception: null, phase: 'active' },
  empty: { exception: null, phase: 'empty' },
  loading: { exception: null, phase: 'loading' },
  pending: { exception: null, phase: 'pending' },
  retained: { exception: null, phase: 'retained' },
};

const createModuleOwner = (definition: ModuleRuntimeDefinition): RuntimeOwner => {
  return {
    kind: 'module',
    token: definition.token,
  };
};

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new Error('Активация модуля была прервана.');
  }
};

const throwIfActionAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new Error('Действие модуля было прервано.');
  }
};

const isPromiseLike = <TValue>(value: TValue): value is TValue & Promise<Awaited<TValue>> => {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
};
