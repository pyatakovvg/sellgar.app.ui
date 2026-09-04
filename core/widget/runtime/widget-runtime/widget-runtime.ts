import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
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
  mergeControllerLoaderData,
  type ControllerLoaderData,
} from '../../../controller/data/controller-loader-data';
import { invokeControllerMethod } from '../../../controller/runtime/controller-method-invoker';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { executeGuardedMethod } from '../../../guard/runtime/guard-method-executor';
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';
import { RuntimeRevalidateService } from '../../../revalidate/runtime/revalidate-service';
import { resolveRuntimeRevalidateState } from '../../../revalidate/runtime/revalidate-state';
import { isRuntimeExceptionSignal } from '../../../runtime/exception/runtime-exception';
import {
  createRuntimeInstanceId,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailure,
  type RuntimeFailureDisposition,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../../runtime/failure/runtime-failure';
import { captureRuntimeFailure } from '../../../runtime/failure/runtime-failure-signal';
import {
  createRuntimeCompletionRevisionGuard,
  createRuntimeRevisionGuard,
  executeRuntimeOperation,
  executeRuntimeParticipant,
  type RuntimeOperationGuard,
  type RuntimeOperationResult,
} from '../../../runtime/operation/runtime-operation';
import { RuntimeOperationCoordinator } from '../../../runtime/operation/runtime-operation-coordinator';
import { ProviderPipeline, type ProviderPipelineContext } from '../../../runtime/provider/provider-pipeline';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { WidgetScope } from '../../../runtime/scope/kind/widget-scope';
import type { WidgetRuntimeDefinition } from '../../declaration/widget';
import { WidgetStateMachine, type WidgetRuntimePhase } from '../widget-state-machine';

export interface ActiveWidgetRuntime<TProps extends object = object> {
  readonly controllers: Map<DependencyToken<unknown>, RuntimeController>;
  readonly definition: WidgetRuntimeDefinition<TProps>;
  loaderData: ControllerLoaderData;
  readonly owner: RuntimeOwner;
  readonly providerPipeline: ProviderPipeline<TProps>;
  readonly scope: WidgetScope;
}

export interface WidgetRuntimeLoadOptions {
  readonly signal?: AbortSignal;
}

export interface WidgetRuntimeActionOptions {
  readonly signal?: AbortSignal;
}

export interface WidgetRuntimeActionState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

export interface WidgetRuntimeRevalidateOptions {
  readonly controllerToken?: DependencyToken<unknown>;
  readonly signal?: AbortSignal;
}

export interface WidgetRuntimeRevalidateState {
  readonly error: unknown;
  readonly inProcess: boolean;
}

export interface WidgetRuntimeSnapshot {
  readonly error: unknown | null;
  readonly phase: WidgetRuntimePhase;
}

type WidgetRuntimeListener = () => void;

interface WidgetRevalidateTask<TProps extends object> {
  readonly runtime: ActiveWidgetRuntime<TProps>;
  readonly promise: Promise<void>;
}

export class WidgetRuntime<TProps extends object = Record<string, never>> {
  private readonly actionAbortControllers = new Map<DependencyToken<unknown>, AbortController>();
  private readonly actionStates = new Map<DependencyToken<unknown>, WidgetRuntimeActionState>();
  private readonly actionTasks = new Set<Promise<unknown>>();
  private readonly disposedRuntimes = new WeakSet<ActiveWidgetRuntime<TProps>>();
  private readonly listeners = new Set<WidgetRuntimeListener>();
  private readonly owner: RuntimeOwner;
  private readonly failureReporter: RuntimeFailureReporterInterface;
  private readonly revalidateStates = new Map<DependencyToken<unknown>, WidgetRuntimeRevalidateState>();
  private readonly revalidateTasks = new Set<WidgetRevalidateTask<TProps>>();
  private readonly stateMachine = new WidgetStateMachine();

  private activeRuntime: ActiveWidgetRuntime<TProps> | null = null;
  private disposePromise: Promise<void> | null = null;
  private loadAbortController: AbortController | null = null;
  private loadPromise: Promise<void> | null = null;
  private propsRevision = 0;
  private revalidateAbortController: AbortController | null = null;
  private revalidateOperationCounter = 0;
  private revalidateQueue: Promise<void> = Promise.resolve();
  private revalidateRevision = 0;
  private revalidateState: WidgetRuntimeRevalidateState = DEFAULT_REVALIDATE_STATE;
  private snapshot: WidgetRuntimeSnapshot = this.stateMachine.getSnapshot();

  constructor(
    private readonly ownerScope: RuntimeScope,
    private readonly definition: WidgetRuntimeDefinition<TProps>,
    private props: TProps,
  ) {
    this.failureReporter = ownerScope.get(RuntimeFailureReporterInterface);
    this.owner = {
      instanceId: createRuntimeInstanceId('widget'),
      kind: 'widget',
      token: definition.token,
    };
  }

  action<TPayload = unknown>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    options: WidgetRuntimeActionOptions = {},
  ): Promise<unknown> {
    const task = this.ownerScope
      .get(RuntimeOperationCoordinator)
      .run(() => this.executeAction(controllerToken, payload, options));

    this.actionTasks.add(task);
    void task.then(
      () => this.actionTasks.delete(task),
      () => this.actionTasks.delete(task),
    );

    return task;
  }

  async dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise;
    }

    if (this.getSnapshot().phase === 'disposed') {
      return;
    }

    this.stateMachine.toDisposing();
    this.loadAbortController?.abort(new Error('Runtime виджета освобождён.'));
    this.interruptRevalidation();
    this.abortActions();

    const runtime = this.activeRuntime;

    this.activeRuntime = null;
    this.emit();

    this.disposePromise = this.finishDispose(runtime).finally(() => {
      this.stateMachine.toDisposed();
      this.emit();
    });

    return this.disposePromise;
  }

  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>): WidgetRuntimeActionState<TResult> {
    return (this.actionStates.get(controllerToken) ?? DEFAULT_ACTION_STATE) as WidgetRuntimeActionState<TResult>;
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    const controller = this.activeRuntime?.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер виджета недоступен.');
    }

    return controller as TController;
  }

  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue {
    const runtime = this.activeRuntime;

    if (!runtime) {
      throw new Error('Данные загрузчика виджета недоступны.');
    }

    return getControllerLoaderData<TValue>(runtime.loaderData, controllerToken);
  }

  getParams(): Readonly<Record<string, unknown>> {
    return EMPTY_PARAMS;
  }

  getProps(): TProps {
    return this.props;
  }

  getPropsRevision(): number {
    return this.propsRevision;
  }

  getRevalidateRevision(): number {
    return this.revalidateRevision;
  }

  getRevalidateState(controllerToken?: DependencyToken<unknown>): WidgetRuntimeRevalidateState {
    return resolveRuntimeRevalidateState(controllerToken, this.revalidateState, this.revalidateStates);
  }

  getScope(): WidgetScope {
    const runtime = this.activeRuntime;

    if (!runtime) {
      throw new Error('Scope виджета недоступен.');
    }

    return runtime.scope;
  }

  getSnapshot(): WidgetRuntimeSnapshot {
    return this.snapshot;
  }

  invoke<TValue>(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): TValue {
    const runtime = this.getOperationalRuntime();
    const controller = runtime.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер виджета недоступен.');
    }

    const source: RuntimeFailureSource = {
      operation: `controller.${String(method)}`,
      owner: this.owner,
      participant: { kind: 'controller', token: controllerToken },
    };

    try {
      const value = this.ownerScope.get(RuntimeOperationCoordinator).run(() =>
        invokeControllerMethod<TValue>({
          args,
          controller,
          method,
          owner: this.owner,
          token: controllerToken,
        }),
      );

      if (isPromiseLike(value)) {
        return value.catch((error) => this.handleInvocationError(error, runtime, source)) as TValue;
      }

      return value;
    } catch (error) {
      return this.handleInvocationError(error, runtime, source);
    }
  }

  load(options: WidgetRuntimeLoadOptions = {}): Promise<void> {
    const phase = this.getSnapshot().phase;

    if (phase === 'ready') {
      return Promise.resolve();
    }

    if (phase === 'disposing' || phase === 'disposed') {
      return Promise.reject(new Error('Runtime виджета уже освобождён.'));
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    const props = this.props;
    const revision = this.stateMachine.startLoading();
    const linkedAbortController = createLinkedAbortController(options.signal);
    const { abortController } = linkedAbortController;

    this.loadAbortController = abortController;
    this.emit();

    const promise = this.executeLoad(props, revision, abortController).finally(() => {
      linkedAbortController.dispose();

      if (this.loadAbortController === abortController) {
        this.loadAbortController = null;
      }

      if (this.loadPromise === promise) {
        this.loadPromise = null;
      }
    });

    this.loadPromise = promise;

    return promise;
  }

  revalidate(options: WidgetRuntimeRevalidateOptions = {}): Promise<void> {
    const runtime = this.getOperationalRuntime();
    const operationId = ++this.revalidateOperationCounter;
    const operationGuard = this.createCompletionGuard();

    this.revalidateAbortController?.abort(new Error('Обновление виджета заменено новым.'));

    const promise = this.revalidateQueue.then(() => {
      if (operationId !== this.revalidateOperationCounter) {
        return;
      }

      return this.executeRevalidate(runtime, options, operationId, operationGuard);
    });
    const task = { promise, runtime };

    this.revalidateTasks.add(task);
    this.revalidateQueue = promise.catch(() => undefined);
    void promise.then(
      () => this.revalidateTasks.delete(task),
      () => this.revalidateTasks.delete(task),
    );

    return promise;
  }

  subscribe(listener: WidgetRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  updateProps(props: TProps): void {
    if (this.getSnapshot().phase === 'disposing' || this.getSnapshot().phase === 'disposed') {
      return;
    }

    this.props = props;
    this.propsRevision++;
    this.emit();
  }

  async failRender(error: unknown): Promise<void> {
    const runtime = this.activeRuntime;

    if (!runtime || !this.transitionToFailed(runtime, error)) {
      return;
    }

    await this.reportFailure(
      captureRuntimeFailure(error, this.createRuntimeSource('render')),
      'widget.failed',
      'failed',
    );
    await this.disposeActiveRuntime(runtime);
  }

  private abortActions(): void {
    for (const abortController of this.actionAbortControllers.values()) {
      abortController.abort(new Error('Runtime виджета освобождён.'));
    }
  }

  private async createActiveRuntime(): Promise<ActiveWidgetRuntime<TProps>> {
    const scope = new WidgetScope(this.ownerScope, (registry) => {
      registry
        .bind(RevalidateServiceInterface)
        .toConstantValue(
          new RuntimeRevalidateService((controllerToken, options) =>
            this.revalidate({ controllerToken, signal: options?.signal }),
          ),
        );
    });
    const controllers = new Map<DependencyToken<unknown>, RuntimeController>();

    try {
      scope.activate(this.definition.token, { collectControllerBindings: true });

      for (const bindingOwner of this.definition.bindingOwners) {
        scope.activate(bindingOwner);
      }

      for (const controllerToken of scope.getControllerTokens()) {
        controllers.set(controllerToken, scope.get(controllerToken) as RuntimeController);
      }

      return {
        controllers,
        definition: this.definition,
        loaderData: createControllerLoaderData([]),
        owner: this.owner,
        providerPipeline: new ProviderPipeline(scope, this.definition.providers, this.owner),
        scope,
      };
    } catch (error) {
      await this.disposeControllers(controllers);
      scope.dispose();
      throw error;
    }
  }

  private createControllerArgs(
    props: TProps,
    signal: AbortSignal,
  ): ControllerArgs<WithProps<TProps, WithParams<Record<string, never>>>> {
    return { params: EMPTY_PARAMS, props, signal };
  }

  private createProviderContext(
    runtime: ActiveWidgetRuntime<TProps>,
    props: TProps,
    signal: AbortSignal,
  ): ProviderPipelineContext<TProps> {
    return { params: EMPTY_PARAMS, props, scope: runtime.scope, signal };
  }

  private createRuntimeSource(operation: string): RuntimeFailureSource {
    return {
      operation,
      owner: this.owner,
      participant: { kind: 'runtime' },
    };
  }

  private createCompletionGuard(): RuntimeOperationGuard | null {
    return this.ownerScope.has(SessionRuntimeStateInterface)
      ? createRuntimeCompletionRevisionGuard(this.ownerScope.get(SessionRuntimeStateInterface))
      : null;
  }

  private createOperationGuard(): RuntimeOperationGuard | null {
    return this.ownerScope.has(SessionRuntimeStateInterface)
      ? createRuntimeRevisionGuard(this.ownerScope.get(SessionRuntimeStateInterface))
      : null;
  }

  private async disposeActiveRuntime(
    runtime: ActiveWidgetRuntime<TProps> | null,
    waitForRevalidations = true,
  ): Promise<void> {
    if (!runtime || this.disposedRuntimes.has(runtime)) {
      return;
    }

    this.disposedRuntimes.add(runtime);
    if (waitForRevalidations) {
      await this.waitForRevalidations(runtime);
    }
    await this.disposeControllers(runtime.controllers);
    await runtime.providerPipeline.dispose();

    try {
      runtime.scope.dispose();
    } catch (error) {
      await this.reportCleanupFailure(error, 'scope.dispose');
    }
  }

  private async disposeControllers(
    controllers: ReadonlyMap<DependencyToken<unknown>, RuntimeController>,
  ): Promise<void> {
    const results = await Promise.allSettled(
      [...controllers.values()].reverse().map((controller) => Promise.resolve().then(() => controller.dispose?.())),
    );

    await Promise.allSettled(
      results.map((result) =>
        result.status === 'rejected'
          ? this.reportCleanupFailure(result.reason, 'controller.dispose')
          : Promise.resolve(),
      ),
    );
  }

  private emit(): void {
    this.snapshot = this.stateMachine.getSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  private async executeAction<TPayload>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    options: WidgetRuntimeActionOptions,
  ): Promise<unknown> {
    const runtime = this.getOperationalRuntime();
    const controller = runtime.controllers.get(controllerToken);

    if (!controller?.action) {
      throw new Error('Действие контроллера виджета недоступно.');
    }

    if (this.actionAbortControllers.has(controllerToken)) {
      throw new Error('Действие виджета уже выполняется.');
    }

    const props = this.props;
    const linkedAbortController = createLinkedAbortController(options.signal);
    const { abortController } = linkedAbortController;

    this.actionAbortControllers.set(controllerToken, abortController);
    this.setActionState(controllerToken, { data: undefined, error: undefined, inProcess: true });

    try {
      const result = await executeRuntimeOperation({
        guard: this.createCompletionGuard(),
        operation: async () => {
          throwIfAborted(abortController.signal, 'Действие виджета было прервано.');
          const args: ControllerArgs<WithPayload<TPayload, WithProps<TProps, WithParams<Record<string, never>>>>> = {
            params: EMPTY_PARAMS,
            payload,
            props,
            signal: abortController.signal,
          };

          const value = await executeRuntimeParticipant(
            {
              operation: 'action',
              owner: this.owner,
              participant: { kind: 'controller', token: controllerToken },
            },
            () =>
              executeGuardedMethod({
                context: args,
                execute: () => controller.action?.(args),
                method: 'action',
                scope: runtime.scope,
                target: controller,
                token: controllerToken,
              }),
          );

          throwIfAborted(abortController.signal, 'Действие виджета было прервано.');

          return value;
        },
        signal: abortController.signal,
        source: this.createRuntimeSource('action'),
      });

      return await this.applyActionResult(runtime, controllerToken, result);
    } finally {
      linkedAbortController.dispose();

      if (this.actionAbortControllers.get(controllerToken) === abortController) {
        this.actionAbortControllers.delete(controllerToken);
      }
    }
  }

  private async executeLoad(props: TProps, revision: number, abortController: AbortController): Promise<void> {
    let runtime: ActiveWidgetRuntime<TProps> | null = null;
    const result = await executeRuntimeOperation({
      guard: this.createOperationGuard(),
      operation: async () => {
        throwIfAborted(abortController.signal, 'Загрузка виджета была прервана.');
        runtime = await this.createActiveRuntime();
        throwIfAborted(abortController.signal, 'Загрузка виджета была прервана.');
        this.activeRuntime = runtime;
        runtime.loaderData = await this.loadRuntime(runtime, props, abortController.signal, true);
        throwIfAborted(abortController.signal, 'Загрузка виджета была прервана.');
      },
      signal: abortController.signal,
      source: this.createRuntimeSource('load'),
    });

    switch (result.type) {
      case 'completed': {
        const completedRuntime = this.activeRuntime;

        if (!completedRuntime) {
          throw new Error('Runtime виджета не был создан.');
        }

        completedRuntime.providerPipeline.commit();
        if (!this.stateMachine.completeLoading(revision)) {
          await this.disposeActiveRuntime(runtime, false);
          return;
        }
        this.emit();
        return;
      }
      case 'interrupted':
        if (this.stateMachine.interruptLoading(revision)) {
          this.activeRuntime = null;
          this.emit();
        }
        await this.disposeActiveRuntime(runtime);
        return;
      case 'rejected':
        if (this.stateMachine.failLoading(revision, result.error)) {
          this.activeRuntime = null;
          this.emit();
        }
        await this.disposeActiveRuntime(runtime);
        throw result.error;
      case 'failed':
      case 'escalated':
        if (this.stateMachine.failLoading(revision, result.failure.cause)) {
          this.activeRuntime = null;
          this.emit();
          await this.reportFailure(result.failure, 'widget.failed', 'failed');
        }
        await this.disposeActiveRuntime(runtime);
        throw result.failure.cause;
    }
  }

  private async executeRevalidate(
    runtime: ActiveWidgetRuntime<TProps>,
    options: WidgetRuntimeRevalidateOptions,
    operationId: number,
    guard: RuntimeOperationGuard | null,
  ): Promise<void> {
    if (!this.isActive(runtime) || options.signal?.aborted || guard?.isInterrupted()) {
      return;
    }

    const props = this.props;
    const controllerToken = options.controllerToken;
    const linkedAbortController = createLinkedAbortController(options.signal);
    const { abortController } = linkedAbortController;

    this.revalidateAbortController = abortController;
    this.resetRevalidateState(false);
    this.setRevalidateState(controllerToken, { error: undefined, inProcess: true });

    try {
      const result = await executeRuntimeOperation({
        guard,
        operation: () => this.loadRuntime(runtime, props, abortController.signal, false, controllerToken),
        signal: abortController.signal,
        source: this.createRuntimeSource('revalidate'),
      });

      if (!this.isCurrentRevalidate(operationId, runtime, abortController)) {
        return;
      }

      await this.applyRevalidateResult(runtime, result, controllerToken);

      if (this.ownsRevalidate(operationId, runtime, abortController)) {
        this.setRevalidateState(controllerToken, DEFAULT_REVALIDATE_STATE);
      }
    } catch (error) {
      if (this.isCurrentRevalidate(operationId, runtime, abortController)) {
        this.setRevalidateState(controllerToken, { error, inProcess: false });
      }
      throw error;
    } finally {
      linkedAbortController.dispose();

      if (this.revalidateAbortController === abortController) {
        this.revalidateAbortController = null;
      }
    }
  }

  private getOperationalRuntime(): ActiveWidgetRuntime<TProps> {
    if (this.getSnapshot().phase !== 'ready' || !this.activeRuntime) {
      throw new Error('Runtime виджета не готов.');
    }

    return this.activeRuntime;
  }

  private handleInvocationError(
    error: unknown,
    runtime: ActiveWidgetRuntime<TProps>,
    source: RuntimeFailureSource,
  ): never {
    if (!isRuntimeExceptionSignal(error)) {
      throw error;
    }

    const failure = captureRuntimeFailure(error, source);

    if (this.transitionToFailed(runtime, failure.cause)) {
      void this.reportFailure(failure, 'widget.failed', 'failed');
      void this.disposeActiveRuntime(runtime);
    }

    throw failure.cause;
  }

  private interruptRevalidation(): void {
    this.revalidateAbortController?.abort(new Error('Runtime виджета освобождён.'));
    this.revalidateOperationCounter++;
  }

  private isActive(runtime: ActiveWidgetRuntime<TProps>): boolean {
    return this.getSnapshot().phase === 'ready' && this.activeRuntime === runtime;
  }

  private isCurrentRevalidate(
    operationId: number,
    runtime: ActiveWidgetRuntime<TProps>,
    abortController: AbortController,
  ): boolean {
    return this.ownsRevalidate(operationId, runtime, abortController) && !abortController.signal.aborted;
  }

  private ownsRevalidate(
    operationId: number,
    runtime: ActiveWidgetRuntime<TProps>,
    abortController: AbortController,
  ): boolean {
    return (
      operationId === this.revalidateOperationCounter &&
      this.revalidateAbortController === abortController &&
      this.activeRuntime === runtime
    );
  }

  private async loadControllers(
    runtime: ActiveWidgetRuntime<TProps>,
    props: TProps,
    signal: AbortSignal,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<ControllerLoaderData> {
    const controllers = selectControllers(runtime.controllers, controllerToken);
    const args = this.createControllerArgs(props, signal);
    const entries = await Promise.all(
      controllers.map(async ([token, controller]) => {
        const value = controller.loader
          ? await executeRuntimeParticipant(
              {
                operation: 'loader',
                owner: this.owner,
                participant: { kind: 'controller', token },
              },
              () =>
                executeGuardedMethod({
                  context: args,
                  execute: () => controller.loader?.(args),
                  method: 'loader',
                  scope: runtime.scope,
                  target: controller,
                  token,
                }),
            )
          : undefined;

        return { controller: token, value };
      }),
    );

    return createControllerLoaderData(entries);
  }

  private async loadRuntime(
    runtime: ActiveWidgetRuntime<TProps>,
    props: TProps,
    signal: AbortSignal,
    initial: boolean,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<ControllerLoaderData> {
    const context = this.createProviderContext(runtime, props, signal);

    throwIfAborted(signal, 'Загрузка виджета была прервана.');

    if (!initial) {
      const [loaderData] = await Promise.all([
        this.loadControllers(runtime, props, signal, controllerToken),
        runtime.providerPipeline.revalidate(context),
      ]);

      throwIfAborted(signal, 'Загрузка виджета была прервана.');

      return loaderData;
    }

    await runtime.providerPipeline.initialize(context);
    throwIfAborted(signal, 'Загрузка виджета была прервана.');

    const [loaderData] = await Promise.all([
      this.loadControllers(runtime, props, signal, controllerToken),
      runtime.providerPipeline.prepare(context),
    ]);

    throwIfAborted(signal, 'Загрузка виджета была прервана.');
    await runtime.providerPipeline.activate(context);
    throwIfAborted(signal, 'Загрузка виджета была прервана.');

    return loaderData;
  }

  private async applyActionResult(
    runtime: ActiveWidgetRuntime<TProps>,
    controllerToken: DependencyToken<unknown>,
    result: RuntimeOperationResult<unknown>,
  ): Promise<unknown> {
    if (!this.isActive(runtime)) {
      return undefined;
    }

    switch (result.type) {
      case 'completed':
        this.setActionState(controllerToken, { data: result.value, error: undefined, inProcess: false });
        return result.value;
      case 'interrupted':
        this.setActionState(controllerToken, DEFAULT_ACTION_STATE);
        return undefined;
      case 'rejected':
        this.setActionState(controllerToken, { data: undefined, error: result.error, inProcess: false });
        return undefined;
      case 'failed':
        this.setActionState(controllerToken, {
          data: undefined,
          error: result.failure.cause,
          inProcess: false,
        });
        await this.reportFailure(result.failure, 'action.failed', 'active');
        return undefined;
      case 'escalated':
        this.setActionState(controllerToken, DEFAULT_ACTION_STATE);
        if (this.transitionToFailed(runtime, result.failure.cause)) {
          await this.reportFailure(result.failure, 'widget.failed', 'failed');
          await this.disposeActiveRuntime(runtime);
        }
        return undefined;
    }
  }

  private async applyRevalidateResult(
    runtime: ActiveWidgetRuntime<TProps>,
    result: RuntimeOperationResult<ControllerLoaderData>,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<void> {
    switch (result.type) {
      case 'completed':
        runtime.loaderData =
          controllerToken === undefined ? result.value : mergeControllerLoaderData(runtime.loaderData, result.value);
        this.emit();
        return;
      case 'interrupted':
        return;
      case 'rejected':
        throw result.error;
      case 'failed':
        await this.reportFailure(result.failure, 'revalidate.failed', 'active');
        throw result.failure.cause;
      case 'escalated':
        if (this.transitionToFailed(runtime, result.failure.cause)) {
          await this.reportFailure(result.failure, 'widget.failed', 'failed');
          await this.disposeActiveRuntime(runtime, false);
        }
    }
  }

  private resetRevalidateState(emit = true): void {
    this.revalidateState = DEFAULT_REVALIDATE_STATE;
    this.revalidateStates.clear();
    this.revalidateRevision++;
    if (emit) this.emit();
  }

  private setActionState(controllerToken: DependencyToken<unknown>, state: WidgetRuntimeActionState): void {
    this.actionStates.set(controllerToken, state);
    this.emit();
  }

  private setRevalidateState(
    controllerToken: DependencyToken<unknown> | undefined,
    state: WidgetRuntimeRevalidateState,
  ): void {
    if (controllerToken === undefined) {
      this.revalidateState = state;
    } else {
      this.revalidateStates.set(controllerToken, state);
    }

    this.revalidateRevision++;
    this.emit();
  }

  private transitionToFailed(runtime: ActiveWidgetRuntime<TProps>, error: unknown): boolean {
    if (this.activeRuntime !== runtime || !this.stateMachine.toFailed(error)) {
      return false;
    }

    this.interruptRevalidation();
    this.abortActions();
    this.activeRuntime = null;
    this.resetRevalidateState(false);
    this.actionStates.clear();
    this.emit();

    return true;
  }

  private async finishDispose(runtime: ActiveWidgetRuntime<TProps> | null): Promise<void> {
    const pending = [
      ...(this.loadPromise ? [this.loadPromise] : []),
      ...this.actionTasks,
      ...[...this.revalidateTasks].map((task) => task.promise),
    ];

    await Promise.allSettled(pending);
    await this.disposeActiveRuntime(runtime);
  }

  private async waitForRevalidations(runtime: ActiveWidgetRuntime<TProps>): Promise<void> {
    while (true) {
      const tasks = [...this.revalidateTasks].filter((task) => task.runtime === runtime).map((task) => task.promise);

      if (tasks.length === 0) {
        return;
      }

      await Promise.allSettled(tasks);
    }
  }

  private async reportCleanupFailure(error: unknown, operation: string): Promise<void> {
    await this.reportFailure(
      captureRuntimeFailure(error, this.createRuntimeSource(operation)),
      'cleanup.contained',
      'disposing',
    );
  }

  private async reportFailure(
    failure: RuntimeFailure,
    disposition: RuntimeFailureDisposition,
    ownerState: string,
  ): Promise<void> {
    await reportRuntimeFailure(this.failureReporter, failure, this.owner, disposition, ownerState);
  }
}

const DEFAULT_ACTION_STATE: WidgetRuntimeActionState = Object.freeze({
  data: undefined,
  error: undefined,
  inProcess: false,
});

const DEFAULT_REVALIDATE_STATE: WidgetRuntimeRevalidateState = Object.freeze({
  error: undefined,
  inProcess: false,
});

const EMPTY_PARAMS: Readonly<Record<string, never>> = Object.freeze({});

const selectControllers = (
  controllers: ReadonlyMap<DependencyToken<unknown>, RuntimeController>,
  controllerToken?: DependencyToken<unknown>,
): Array<[DependencyToken<unknown>, RuntimeController]> => {
  if (controllerToken === undefined) {
    return [...controllers];
  }

  const controller = controllers.get(controllerToken);

  if (!controller) {
    throw new Error('Контроллер виджета недоступен.');
  }

  return [[controllerToken, controller]];
};

interface LinkedAbortController {
  readonly abortController: AbortController;
  dispose(): void;
}

const createLinkedAbortController = (signal?: AbortSignal): LinkedAbortController => {
  const abortController = new AbortController();
  const abort = (): void => abortController.abort(signal?.reason);

  if (signal?.aborted) {
    abort();
  } else {
    signal?.addEventListener('abort', abort, { once: true });
  }

  return {
    abortController,
    dispose: () => signal?.removeEventListener('abort', abort),
  };
};

const throwIfAborted = (signal: AbortSignal, message: string): void => {
  if (signal.aborted) {
    throw new Error(message);
  }
};

const isPromiseLike = <TValue>(value: TValue): value is TValue & Promise<Awaited<TValue>> => {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
};
