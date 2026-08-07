import type {
  ControllerActionArgs,
  ControllerInterface,
  ControllerLoaderArgs,
} from '../../../controller/contract/controller';
import {
  createControllerLoaderData,
  getControllerLoaderData,
  mergeControllerLoaderData,
  type ControllerLoaderData,
} from '../../../controller/data/controller-loader-data';
import type { DependencyToken } from '../../../di/token/dependency-token';
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
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';
import { RuntimeRevalidateService } from '../../../revalidate/runtime/revalidate-service';

import { getModuleMetadata, type ModuleConstructor, type ModuleMetadata } from '../../declaration/module';
import { resolveModuleExport } from '../../resolution/module-export-resolver';

export interface ActiveModuleRuntime {
  readonly controllers: Map<DependencyToken<unknown>, ControllerInterface>;
  loaderData: ControllerLoaderData;
  loaderParams: Record<string, string | undefined>;
  loaderRequestUrl: string;
  readonly metadata: ModuleMetadata;
  readonly module: ModuleConstructor;
  readonly providerPipeline: RuntimeProviderPipeline;
  readonly scope: ModuleScope;
}

interface ModuleCleanupTask {
  readonly moduleRuntime: ActiveModuleRuntime;
  readonly promise: Promise<void>;
}

export interface ModuleRuntimeRevalidateOptions {
  readonly controllerToken?: DependencyToken<unknown>;
  readonly signal?: AbortSignal;
}

export const MODULE_ACTION_ID_FIELD = '__sellgarAppActionId';

export interface ModuleRuntimeActionReference {
  readonly id: string;
}

export interface ModuleRuntimeActionState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

type ModuleRuntimeActionArgs = Pick<ControllerActionArgs, 'params' | 'request'>;

type ModuleRuntimeActionStatus = 'registered' | 'executing' | 'completed' | 'failed' | 'interrupted' | 'finished';

interface ModuleRuntimeActionOperation extends ModuleRuntimeActionReference {
  readonly controllerToken: DependencyToken<unknown>;
  readonly module: ActiveModuleRuntime;
  readonly owner: ModuleRuntime;
  readonly payload: unknown;
  data?: unknown;
  detached: boolean;
  error?: unknown;
  status: ModuleRuntimeActionStatus;
}

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
    };

export class ModuleRuntime {
  private readonly actionOperationIds = new Map<DependencyToken<unknown>, string>();
  private readonly actionOperations = new Map<string, ModuleRuntimeActionOperation>();
  private readonly actionStates = new Map<DependencyToken<unknown>, ModuleRuntimeActionState>();
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

  startAction<TPayload>(controllerToken: DependencyToken<unknown>, payload: TPayload): ModuleRuntimeActionReference {
    const activeModule = this.getActiveModule();
    const controller = activeModule.controllers.get(controllerToken);

    if (!controller?.action) {
      throw new Error('Действие контроллера недоступно.');
    }

    if (this.actionOperationIds.has(controllerToken)) {
      throw new Error('Действие контроллера уже выполняется.');
    }

    const operation: ModuleRuntimeActionOperation = {
      controllerToken,
      detached: false,
      id: globalThis.crypto.randomUUID(),
      module: activeModule,
      owner: this,
      payload,
      status: 'registered',
    };

    this.actionOperationIds.set(controllerToken, operation.id);
    this.actionOperations.set(operation.id, operation);
    this.setActionState(controllerToken, {
      data: undefined,
      error: undefined,
      inProcess: true,
    });

    return operation;
  }

  async runAction(actionId: string, args: ModuleRuntimeActionArgs): Promise<unknown> {
    const operation = this.getActionOperation(actionId);

    if (operation.status !== 'registered') {
      throw new Error('Действие контроллера уже было запущено.');
    }

    if (operation.module !== this.getActiveModule()) {
      throw new Error('Действие контроллера не принадлежит активному модулю.');
    }

    const controller = operation.module.controllers.get(operation.controllerToken);

    if (!controller?.action) {
      throw new Error('Действие контроллера недоступно.');
    }

    operation.status = 'executing';

    const actionArgs: ControllerActionArgs = {
      params: args.params,
      payload: operation.payload,
      request: args.request,
    };

    return await executeRuntimeParticipant(
      {
        operation: 'action',
        owner: createModuleOwner(operation.module),
        participant: { kind: 'controller', token: operation.controllerToken },
      },
      () =>
        executeGuardedMethod({
          context: actionArgs,
          execute: () => {
            return controller.action?.(actionArgs);
          },
          method: 'action',
          scope: operation.module.scope,
          target: controller,
          token: operation.controllerToken,
        }),
    );
  }

  completeAction(actionId: string, data: unknown): void {
    const operation = this.getActionOperation(actionId);

    if (operation.status !== 'executing') {
      throw new Error('Нельзя завершить действие контроллера, которое не выполняется.');
    }

    operation.data = data;
    operation.status = 'completed';
  }

  failAction(actionId: string, error: unknown): boolean {
    const operation = this.actionOperations.get(actionId);

    if (!operation || operation.status === 'finished' || operation.status === 'interrupted') {
      return false;
    }

    operation.error = error;
    operation.status = 'failed';

    return true;
  }

  interruptAction(actionId: string): boolean {
    const operation = this.actionOperations.get(actionId);

    if (!operation || operation.status === 'finished') {
      return false;
    }

    operation.status = 'interrupted';

    return true;
  }

  finishAction<TResult = unknown>(reference: ModuleRuntimeActionReference): TResult | undefined {
    const operation = this.readActionReference(reference);

    if (operation.status === 'registered' || operation.status === 'executing') {
      operation.error = new Error('React Router завершил submit до выполнения действия контроллера.');
      operation.status = 'failed';
    }

    this.releaseAction(operation);

    switch (operation.status) {
      case 'completed':
        operation.status = 'finished';

        if (!operation.detached) {
          this.setActionState(operation.controllerToken, {
            data: operation.data,
            error: undefined,
            inProcess: false,
          });
        }

        return operation.data as TResult;
      case 'failed': {
        const error = operation.error;

        operation.status = 'finished';

        if (!operation.detached) {
          this.setActionState(operation.controllerToken, {
            data: undefined,
            error,
            inProcess: false,
          });
        }

        throw error;
      }
      case 'interrupted':
        operation.status = 'finished';

        if (!operation.detached) {
          this.setActionState(operation.controllerToken, DEFAULT_ACTION_STATE);
        }

        return undefined;
      case 'finished':
        throw new Error('Действие контроллера уже завершено.');
    }
  }

  async load(args: ControllerLoaderArgs): Promise<unknown> {
    const moduleRuntime = await this.activate(args.request.signal);

    try {
      return await this.loadModuleRuntime(moduleRuntime, args);
    } catch (error) {
      if (args.request.signal.aborted && this.state.phase === 'pending' && this.state.pending === moduleRuntime) {
        this.disposePending();
      }

      throw error;
    }
  }

  async revalidate(options: ModuleRuntimeRevalidateOptions = {}): Promise<void> {
    const moduleRuntime = this.getActiveModule();
    const abortController = new AbortController();
    const externalSignal = options.signal;
    const abortRevalidate = (): void => {
      abortController.abort();
    };

    if (externalSignal?.aborted) {
      abortController.abort();
    } else {
      externalSignal?.addEventListener('abort', abortRevalidate, { once: true });
    }

    const args: ControllerLoaderArgs = {
      params: moduleRuntime.loaderParams,
      request: new Request(moduleRuntime.loaderRequestUrl, {
        signal: abortController.signal,
      }),
    };

    try {
      const owner = createModuleOwner(moduleRuntime);
      const source = {
        operation: 'revalidate',
        owner,
        participant: { kind: 'runtime' as const },
      };
      const result = await executeRuntimeOperation({
        guard: null,
        operation: () => this.loadModuleRuntime(moduleRuntime, args, options.controllerToken),
        signal: abortController.signal,
        source,
      });

      switch (result.type) {
        case 'completed':
          moduleRuntime.loaderData =
            options.controllerToken === undefined
              ? result.value
              : mergeControllerLoaderData(moduleRuntime.loaderData, result.value);
          this.emit();
          return;
        case 'interrupted':
          return;
        case 'rejected':
          throw result.error;
        case 'failed':
          await reportRuntimeFailure(
            this.ownerScope.get(RuntimeFailureReporterInterface),
            result.failure,
            owner,
            'revalidate.failed',
            'active',
          );
          throw result.failure.cause;
      }
    } finally {
      externalSignal?.removeEventListener('abort', abortRevalidate);
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
    args: ControllerLoaderArgs,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<ControllerLoaderData> {
    await this.runProviderBeforeLoad(moduleRuntime, args);
    this.throwIfAborted(args.request.signal);

    const loaderData = await this.loadControllers(moduleRuntime, args, controllerToken);

    this.throwIfAborted(args.request.signal);
    await this.runProviderSetup(moduleRuntime, args);
    this.throwIfAborted(args.request.signal);
    await this.runProviderBeforeRender(moduleRuntime, args);
    this.throwIfAborted(args.request.signal);

    if (controllerToken === undefined) {
      moduleRuntime.loaderData = loaderData;
      moduleRuntime.loaderParams = args.params;
      moduleRuntime.loaderRequestUrl = args.request.url;
      this.emit();
    }

    return loaderData;
  }

  async dispose(): Promise<void> {
    const activeModule = this.getActiveModuleOrNull();
    const pendingModule = this.state.phase === 'pending' ? this.state.pending : null;

    this.state = { phase: 'empty' };
    this.detachActions();

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

  private detachActions(): void {
    this.actionOperations.forEach((operation) => {
      operation.detached = true;
      operation.status = 'interrupted';
    });
    this.actionOperations.clear();
    this.actionOperationIds.clear();
    this.actionStates.clear();
    this.emit();
  }

  private getActionOperation(actionId: string): ModuleRuntimeActionOperation {
    const operation = this.actionOperations.get(actionId);

    if (!operation) {
      throw new Error('Действие контроллера не зарегистрировано в активном модуле.');
    }

    return operation;
  }

  private readActionReference(reference: ModuleRuntimeActionReference): ModuleRuntimeActionOperation {
    const operation = reference as ModuleRuntimeActionOperation;

    if (operation.owner !== this) {
      throw new Error('Действие контроллера принадлежит другому runtime модуля.');
    }

    return operation;
  }

  private releaseAction(operation: ModuleRuntimeActionOperation): void {
    if (this.actionOperations.get(operation.id) === operation) {
      this.actionOperations.delete(operation.id);
    }

    if (this.actionOperationIds.get(operation.controllerToken) === operation.id) {
      this.actionOperationIds.delete(operation.controllerToken);
    }
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
        new RuntimeRevalidateService((controllerToken, options) =>
          this.revalidate({
            controllerToken,
            signal: options?.signal,
          }),
        ),
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
        loaderRequestUrl: 'http://localhost/module-runtime',
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

  private resolveControllers(moduleScope: ModuleScope): Map<DependencyToken<unknown>, ControllerInterface> {
    const controllers = new Map<DependencyToken<unknown>, ControllerInterface>();

    for (const controllerToken of moduleScope.getControllerTokens()) {
      controllers.set(controllerToken, moduleScope.get(controllerToken) as ControllerInterface);
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
    args: ControllerLoaderArgs,
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

  private async runProviderBeforeLoad(moduleRuntime: ActiveModuleRuntime, args: ControllerLoaderArgs): Promise<void> {
    const context = createProviderContext(moduleRuntime.scope, args);

    await moduleRuntime.providerPipeline.runBeforeLoad(context);
  }

  private async runProviderBeforeRender(moduleRuntime: ActiveModuleRuntime, args: ControllerLoaderArgs): Promise<void> {
    const context = createProviderContext(moduleRuntime.scope, args);

    await moduleRuntime.providerPipeline.runBeforeRender(context);
  }

  private async runProviderSetup(moduleRuntime: ActiveModuleRuntime, args: ControllerLoaderArgs): Promise<void> {
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

const createProviderContext = (scope: ModuleScope, args: ControllerLoaderArgs): RuntimeProviderPipelineContext => {
  return {
    params: args.params,
    props: {},
    request: args.request,
    scope,
    signal: args.request.signal,
  };
};

const DEFAULT_ACTION_STATE: ModuleRuntimeActionState = {
  data: undefined,
  error: undefined,
  inProcess: false,
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
