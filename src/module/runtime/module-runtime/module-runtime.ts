import type {
  ControllerArgs,
  RuntimeController,
  WithParams,
  WithPayload,
  WithProps,
} from '../../../controller/contract/controller';
import {
  createControllerLoaderData,
  getControllerLoaderData,
  type ControllerLoaderData,
} from '../../../controller/data/controller-loader-data';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { invokeControllerMethod } from '../../../controller/runtime';
import { executeGuardedMethod } from '../../../guard/runtime/guard-method-executor';
import { ModuleScope } from '../../../runtime/scope/kind';
import {
  RuntimeProviderPipeline,
  type RuntimeProviderPipelineContext,
} from '../../../runtime/provider/runtime-provider-pipeline';
import type { RuntimeScope } from '../../../runtime/scope/base';
import {
  captureRuntimeFailure,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeOwner,
} from '../../../runtime/failure';
import { executeRuntimeOperation, executeRuntimeParticipant } from '../../../runtime/operation';
import { RuntimeOperationCoordinator } from '../../../runtime/operation';
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';
import { RuntimeRevalidateService } from '../../../revalidate/runtime/revalidate-service';

import { getModuleMetadata, type ModuleConstructor, type ModuleMetadata } from '../../declaration/module';
import { resolveModuleExport } from '../../resolution/module-export-resolver';

export interface ActiveModuleRuntime {
  readonly controllers: Map<DependencyToken<unknown>, RuntimeController>;
  loaderData: ControllerLoaderData;
  loaderParams: Record<string, string | undefined>;
  readonly metadata: ModuleMetadata;
  readonly module: ModuleConstructor;
  readonly providerPipeline: RuntimeProviderPipeline;
  readonly scope: ModuleScope;
}

interface ModuleCleanupTask {
  readonly moduleRuntime: ActiveModuleRuntime;
  readonly promise: Promise<void>;
}

export interface ModuleRuntimeActionState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

type ModuleControllerContext = ControllerArgs<WithParams<Record<string, string | undefined>, WithProps<object>>>;

type ModuleRuntimeListener = () => void;

type ModuleRuntimeState =
  | {
      readonly phase: 'empty';
    }
  | {
      readonly active: ActiveModuleRuntime | null;
      readonly phase: 'loading';
      readonly promise: Promise<ActiveModuleRuntime>;
      readonly sessionId: number;
    }
  | {
      readonly active: ActiveModuleRuntime | null;
      readonly pending: ActiveModuleRuntime;
      readonly phase: 'pending';
      readonly sessionId: number;
    }
  | {
      readonly active: ActiveModuleRuntime;
      readonly phase: 'active';
    }
  | {
      readonly active: ActiveModuleRuntime;
      readonly phase: 'failed';
      readonly snapshot: ModuleRuntimeSnapshot;
    };

export interface ModuleRuntimeSnapshot {
  readonly error: unknown | null;
  readonly phase: ModuleRuntimeState['phase'];
}

export class ModuleRuntime {
  private readonly actionStates = new Map<DependencyToken<unknown>, ModuleRuntimeActionState>();
  private readonly activeActions = new Set<DependencyToken<unknown>>();
  private readonly cleanupTasks = new Set<ModuleCleanupTask>();
  private readonly disposedModules = new WeakSet<ActiveModuleRuntime>();
  private readonly listeners = new Set<ModuleRuntimeListener>();

  private state: ModuleRuntimeState = { phase: 'empty' };
  private sessionCounter = 0;

  constructor(
    private readonly ownerScope: RuntimeScope,
    private readonly loadModule: () => Promise<Record<string, unknown>>,
    private readonly routeOwner: RuntimeOwner,
  ) {}

  async activate(signal: AbortSignal): Promise<ActiveModuleRuntime> {
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

        return;
      }

      this.disposePending();
    };

    signal.addEventListener('abort', abortPending, { once: true });

    const promise = this.activateModule(signal)
      .then((activeModule) => {
        if (signal.aborted || !this.isSessionActive(sessionId)) {
          this.scheduleModuleDispose(activeModule);
          throw new Error('Активация модуля была прервана.');
        }

        this.state = {
          active,
          pending: activeModule,
          phase: 'pending',
          sessionId,
        };

        return activeModule;
      })
      .catch((error) => {
        if (this.state.phase === 'loading' && this.state.sessionId === sessionId) {
          this.state = active ? { active, phase: 'active' } : { phase: 'empty' };
        }

        throw error;
      })
      .finally(() => {
        signal.removeEventListener('abort', abortPending);

        if (this.state.phase === 'loading' && this.state.sessionId === sessionId) {
          this.state = active ? { active, phase: 'active' } : { phase: 'empty' };
        }
      });

    this.state = {
      active,
      phase: 'loading',
      promise,
      sessionId,
    };

    return promise;
  }

  getActiveModule(): ActiveModuleRuntime {
    const activeModule = this.getActiveModuleOrNull();

    if (!activeModule) {
      throw new Error('Runtime модуля не активен.');
    }

    return activeModule;
  }

  getActiveModuleOrNull(): ActiveModuleRuntime | null {
    switch (this.state.phase) {
      case 'active':
      case 'failed':
        return this.state.active;
      case 'loading':
      case 'pending':
        return this.state.active;
      case 'empty':
        return null;
    }
  }

  getErrorBoundaryModuleOrNull(): ActiveModuleRuntime | null {
    if (this.state.phase === 'pending') {
      return this.state.pending;
    }

    return this.getActiveModuleOrNull();
  }

  getViewModuleOrNull(): ActiveModuleRuntime | null {
    const activeModule = this.getActiveModuleOrNull();

    if (activeModule) {
      return activeModule;
    }

    if (this.state.phase === 'pending') {
      return this.state.pending;
    }

    return null;
  }

  getSnapshot(): ModuleRuntimeSnapshot {
    return this.state.phase === 'failed' ? this.state.snapshot : MODULE_RUNTIME_SNAPSHOTS[this.state.phase];
  }

  invoke<TValue>(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): TValue {
    const viewModule = this.getViewModuleOrNull();
    const controller = viewModule?.controllers.get(controllerToken);

    if (!viewModule || !controller) {
      throw new Error('Контроллер модуля недоступен.');
    }

    return invokeControllerMethod({
      args,
      controller,
      method,
      owner: createModuleOwner(viewModule),
      token: controllerToken,
    });
  }

  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue {
    const moduleRuntime = this.getViewModuleOrNull();

    if (!moduleRuntime) {
      throw new Error('Данные загрузчика модуля недоступны.');
    }

    return getControllerLoaderData<TValue>(moduleRuntime.loaderData, controllerToken);
  }

  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>): ModuleRuntimeActionState<TResult> {
    return (this.actionStates.get(controllerToken) ?? DEFAULT_ACTION_STATE) as ModuleRuntimeActionState<TResult>;
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    const controller = this.getViewModuleOrNull()?.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер модуля недоступен.');
    }

    return controller as TController;
  }

  async action<TPayload>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    args: ModuleControllerContext,
  ): Promise<unknown> {
    const activeModule = this.getActiveModule();
    const controller = activeModule.controllers.get(controllerToken);

    if (!controller?.action) {
      throw new Error('Действие контроллера недоступно.');
    }

    if (this.activeActions.has(controllerToken)) {
      throw new Error('Действие контроллера уже выполняется.');
    }

    this.activeActions.add(controllerToken);
    this.setActionState(controllerToken, {
      data: undefined,
      error: undefined,
      inProcess: true,
    });

    const actionArgs: ControllerArgs<
      WithPayload<unknown, WithParams<Record<string, string | undefined>, WithProps<object>>>
    > = {
      params: args.params,
      payload,
      props: args.props,
      signal: args.signal,
    };

    try {
      const result = await executeRuntimeOperation({
        guard: null,
        operation: () =>
          executeRuntimeParticipant(
            {
              operation: 'action',
              owner: createModuleOwner(activeModule),
              participant: { kind: 'controller', token: controllerToken },
            },
            () =>
              executeGuardedMethod({
                context: actionArgs,
                execute: () => controller.action?.(actionArgs),
                method: 'action',
                scope: activeModule.scope,
                target: controller,
                token: controllerToken,
              }),
          ),
        signal: args.signal,
        source: {
          operation: 'action',
          owner: createModuleOwner(activeModule),
          participant: { kind: 'controller', token: controllerToken },
        },
      });

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
            this.ownerScope.get(RuntimeFailureReporterInterface),
            result.failure,
            createModuleOwner(activeModule),
            'action.failed',
            'active',
          );
          return undefined;
        case 'escalated':
          this.setActionState(controllerToken, DEFAULT_ACTION_STATE);
          this.state = {
            active: activeModule,
            phase: 'failed',
            snapshot: {
              error: result.failure.cause,
              phase: 'failed',
            },
          };
          this.emit();
          await reportRuntimeFailure(
            this.ownerScope.get(RuntimeFailureReporterInterface),
            result.failure,
            createModuleOwner(activeModule),
            'module.failed',
            'failed',
          );
          return undefined;
      }
    } finally {
      this.activeActions.delete(controllerToken);
    }
  }

  async load(args: ModuleControllerContext): Promise<unknown> {
    const moduleRuntime = await this.activate(args.signal);

    try {
      return await this.loadModuleRuntime(moduleRuntime, args);
    } catch (error) {
      if (args.signal.aborted && this.state.phase === 'pending' && this.state.pending === moduleRuntime) {
        this.disposePending();
      }

      throw error;
    }
  }

  subscribe(listener: ModuleRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  commit(): void {
    if (this.state.phase !== 'pending') {
      return;
    }

    const activeModule = this.state.active;
    const pendingModule = this.state.pending;

    this.state = {
      active: pendingModule,
      phase: 'active',
    };

    if (activeModule && activeModule !== pendingModule) {
      this.scheduleModuleDispose(activeModule);
    }
  }

  discardPending(): void {
    this.disposePending();
  }

  private async loadModuleRuntime(
    moduleRuntime: ActiveModuleRuntime,
    args: ModuleControllerContext,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<ControllerLoaderData> {
    await this.runProviderBeforeLoad(moduleRuntime, args);
    this.throwIfAborted(args.signal);

    const loaderData = await this.loadControllers(moduleRuntime, args, controllerToken);

    this.throwIfAborted(args.signal);
    await this.runProviderSetup(moduleRuntime, args);
    this.throwIfAborted(args.signal);
    await this.runProviderBeforeRender(moduleRuntime, args);
    this.throwIfAborted(args.signal);

    if (controllerToken === undefined) {
      moduleRuntime.loaderData = loaderData;
      moduleRuntime.loaderParams = args.params;
      this.emit();
    }

    return loaderData;
  }

  async dispose(): Promise<void> {
    const activeModule = this.getActiveModuleOrNull();
    const pendingModule = this.state.phase === 'pending' ? this.state.pending : null;

    this.state = { phase: 'empty' };
    this.activeActions.clear();
    this.actionStates.clear();
    this.emit();

    if (pendingModule) {
      this.scheduleModuleDispose(pendingModule);
    }

    if (activeModule && activeModule !== pendingModule) {
      this.scheduleModuleDispose(activeModule);
    }

    await this.waitForCleanup();
  }

  private disposePending(): void {
    if (this.state.phase !== 'pending') {
      return;
    }

    const activeModule = this.state.active;
    const pendingModule = this.state.pending;

    this.state = activeModule ? { active: activeModule, phase: 'active' } : { phase: 'empty' };

    this.scheduleModuleDispose(pendingModule);
  }

  private setActionState(controllerToken: DependencyToken<unknown>, state: ModuleRuntimeActionState): void {
    this.actionStates.set(controllerToken, state);
    this.emit();
  }

  private isSessionActive(sessionId: number): boolean {
    return (this.state.phase === 'loading' || this.state.phase === 'pending') && this.state.sessionId === sessionId;
  }

  private async disposeModule(moduleRuntime: ActiveModuleRuntime): Promise<void> {
    const controllerResults = await Promise.allSettled(
      [...moduleRuntime.controllers.values()].map((controller) => {
        return Promise.resolve().then(() => controller.dispose?.());
      }),
    );

    await Promise.all(
      controllerResults.map((result) => {
        return result.status === 'rejected'
          ? this.reportCleanupFailure(moduleRuntime, result.reason, 'controller.dispose')
          : Promise.resolve();
      }),
    );

    await moduleRuntime.providerPipeline.dispose();

    try {
      moduleRuntime.scope.dispose();
    } catch (error) {
      await this.reportCleanupFailure(moduleRuntime, error, 'scope.dispose');
    }
  }

  private scheduleModuleDispose(moduleRuntime: ActiveModuleRuntime): void {
    if (this.disposedModules.has(moduleRuntime)) {
      return;
    }

    this.disposedModules.add(moduleRuntime);

    const task: ModuleCleanupTask = {
      moduleRuntime,
      promise: this.disposeModule(moduleRuntime),
    };

    this.cleanupTasks.add(task);
    void task.promise.finally(() => {
      this.cleanupTasks.delete(task);
    });
  }

  private async waitForCleanup(): Promise<void> {
    while (this.cleanupTasks.size > 0) {
      await Promise.all(
        [...this.cleanupTasks].map((task) => {
          return task.promise;
        }),
      );
    }
  }

  private async activateModule(signal: AbortSignal): Promise<ActiveModuleRuntime> {
    const moduleExports = await executeRuntimeParticipant(
      {
        operation: 'load-module',
        owner: this.routeOwner,
        participant: { kind: 'runtime' },
      },
      this.loadModule,
    );

    if (signal.aborted) {
      throw new Error('Активация модуля была прервана.');
    }

    const moduleConstructor = resolveModuleExport(moduleExports);
    const moduleScope = new ModuleScope(this.ownerScope, (registry) => {
      registry.bind(RevalidateServiceInterface).toConstantValue(
        new RuntimeRevalidateService(() => {
          moduleScope.get(RuntimeOperationCoordinator).invalidate();
          return Promise.resolve();
        }),
      );
    });

    try {
      moduleScope.activate(moduleConstructor, { collectControllerBindings: true });

      const metadata = getModuleMetadata(moduleConstructor);
      const providerPipeline = new RuntimeProviderPipeline(moduleScope, metadata.providers ?? [], {
        kind: 'module',
        token: moduleConstructor,
      });
      const controllers = this.resolveControllers(moduleScope);

      return {
        controllers,
        loaderData: createControllerLoaderData([]),
        loaderParams: {},
        metadata,
        module: moduleConstructor,
        providerPipeline,
        scope: moduleScope,
      };
    } catch (error) {
      moduleScope.dispose();
      throw error;
    }
  }

  private resolveControllers(moduleScope: ModuleScope): Map<DependencyToken<unknown>, RuntimeController> {
    const controllers = new Map<DependencyToken<unknown>, RuntimeController>();

    for (const controllerToken of moduleScope.getControllerTokens()) {
      controllers.set(controllerToken, moduleScope.get(controllerToken) as RuntimeController);
    }

    return controllers;
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private async loadControllers(
    moduleRuntime: ActiveModuleRuntime,
    args: ModuleControllerContext,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<ControllerLoaderData> {
    const controllers = getControllerEntries(
      moduleRuntime.controllers,
      controllerToken,
      'Контроллер модуля недоступен.',
    );
    const entries = await Promise.all(
      controllers.map(async ([controllerToken, controller]) => {
        const value = controller?.loader
          ? await executeRuntimeParticipant(
              {
                operation: 'loader',
                owner: createModuleOwner(moduleRuntime),
                participant: { kind: 'controller', token: controllerToken },
              },
              () =>
                executeGuardedMethod({
                  context: args,
                  execute: () => {
                    return controller.loader?.(args);
                  },
                  method: 'loader',
                  scope: moduleRuntime.scope,
                  target: controller,
                  token: controllerToken,
                }),
            )
          : void 0;

        return {
          controller: controllerToken,
          value,
        };
      }),
    );

    return createControllerLoaderData(entries);
  }

  private async runProviderBeforeLoad(
    moduleRuntime: ActiveModuleRuntime,
    args: ModuleControllerContext,
  ): Promise<void> {
    const context = createProviderContext(moduleRuntime.scope, args);

    await moduleRuntime.providerPipeline.runBeforeLoad(context);
  }

  private async runProviderBeforeRender(
    moduleRuntime: ActiveModuleRuntime,
    args: ModuleControllerContext,
  ): Promise<void> {
    const context = createProviderContext(moduleRuntime.scope, args);

    await moduleRuntime.providerPipeline.runBeforeRender(context);
  }

  private async runProviderSetup(moduleRuntime: ActiveModuleRuntime, args: ModuleControllerContext): Promise<void> {
    const context = createProviderContext(moduleRuntime.scope, args);

    await moduleRuntime.providerPipeline.setup(context);
  }

  private async reportCleanupFailure(
    moduleRuntime: ActiveModuleRuntime,
    error: unknown,
    operation: string,
  ): Promise<void> {
    const owner = createModuleOwner(moduleRuntime);
    const failure = captureRuntimeFailure(error, {
      operation,
      owner,
      participant: { kind: 'runtime' },
    });

    await reportRuntimeFailure(
      this.ownerScope.get(RuntimeFailureReporterInterface),
      failure,
      owner,
      'cleanup.contained',
      'disposing',
    );
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error('Активация модуля была прервана.');
    }
  }
}

const createProviderContext = (scope: ModuleScope, args: ModuleControllerContext): RuntimeProviderPipelineContext => {
  return {
    params: args.params,
    props: args.props,
    scope,
    signal: args.signal,
  };
};

const DEFAULT_ACTION_STATE: ModuleRuntimeActionState = {
  data: undefined,
  error: undefined,
  inProcess: false,
};

const MODULE_RUNTIME_SNAPSHOTS: Record<Exclude<ModuleRuntimeState['phase'], 'failed'>, ModuleRuntimeSnapshot> = {
  active: { error: null, phase: 'active' },
  empty: { error: null, phase: 'empty' },
  loading: { error: null, phase: 'loading' },
  pending: { error: null, phase: 'pending' },
};

const getControllerEntries = <TController>(
  controllers: ReadonlyMap<DependencyToken<unknown>, TController>,
  controllerToken: DependencyToken<unknown> | undefined,
  errorMessage: string,
): Array<[DependencyToken<unknown>, TController]> => {
  if (controllerToken === undefined) {
    return [...controllers];
  }

  const controller = controllers.get(controllerToken);

  if (controller === undefined) {
    throw new Error(errorMessage);
  }

  return [[controllerToken, controller]];
};

const createModuleOwner = (moduleRuntime: ActiveModuleRuntime): RuntimeOwner => {
  return {
    kind: 'module',
    token: moduleRuntime.module,
  };
};
