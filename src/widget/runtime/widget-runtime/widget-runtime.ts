import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import {
  createControllerActionKey,
  createControllerLoaderData,
  getControllerLoaderData,
  mergeControllerLoaderData,
  type ControllerLoaderData,
} from '../../../controller/data/controller-loader-data';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { executeGuardedMethod } from '../../../guard/runtime/guard-method-executor';
import {
  RuntimeProviderPipeline,
  type RuntimeProviderPipelineContext,
} from '../../../runtime/provider/runtime-provider-pipeline';
import { WidgetScope } from '../../../runtime/scope/kind';
import type { RuntimeScope } from '../../../runtime/scope/base';
import {
  createRuntimeRevisionGuard,
  executeRuntimeParticipant,
  executeRuntimeOperation,
  type RuntimeOperationGuard,
  type RuntimeOperationResult,
} from '../../../runtime/operation';
import {
  captureRuntimeFailure,
  createRuntimeInstanceId,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailure,
  type RuntimeFailureDisposition,
  type RuntimeOwner,
} from '../../../runtime/failure';
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';
import { RuntimeRevalidateService } from '../../../revalidate/runtime/revalidate-service';

import { getWidgetMetadata } from '../../declaration/widget';
import type { WidgetConstructor, WidgetMetadata } from '../../declaration/widget';

import type {
  WidgetControllerActionArgs,
  WidgetControllerInterface,
  WidgetControllerLoaderArgs,
} from '../widget-controller';
import { WidgetStateMachine, type WidgetRuntimePhase } from '../widget-state-machine';

export interface ActiveWidgetRuntime<TProps extends object = object> {
  readonly controllers: Map<DependencyToken<unknown>, WidgetControllerInterface<TProps>>;
  readonly loaderData: ControllerLoaderData;
  readonly metadata: WidgetMetadata<TProps>;
  readonly providerPipeline: RuntimeProviderPipeline<TProps>;
  readonly scope: WidgetScope;
  readonly widget: WidgetConstructor;
}

export interface WidgetRuntimeLoadOptions {
  readonly signal?: AbortSignal;
}

export interface WidgetRuntimeActionOptions {
  readonly signal?: AbortSignal;
}

interface WidgetRuntimeActionState<TResult = unknown> {
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

export class WidgetRuntime<TProps extends object = Record<string, never>> {
  private readonly listeners = new Set<WidgetRuntimeListener>();
  private readonly metadata: WidgetMetadata<TProps>;
  private readonly revalidateStates = new Map<DependencyToken<unknown>, WidgetRuntimeRevalidateState>();
  private readonly stateMachine = new WidgetStateMachine();
  private readonly owner: RuntimeOwner;

  private readonly actionAbortControllers = new Map<DependencyToken<unknown>, AbortController>();
  private readonly actionStates = new Map<DependencyToken<unknown>, WidgetRuntimeActionState>();
  private currentWidgetRuntime: ActiveWidgetRuntime<TProps> | null = null;
  private disposePromise: Promise<void> | null = null;
  private loadAbortController: AbortController | null = null;
  private loadPromise: Promise<void> | null = null;
  private renderFailed = false;
  private revalidateRevision = 0;
  private revalidateState: WidgetRuntimeRevalidateState = DEFAULT_REVALIDATE_STATE;
  private snapshot: WidgetRuntimeSnapshot = this.stateMachine.getSnapshot();

  constructor(
    private readonly ownerScope: RuntimeScope,
    private readonly widget: WidgetConstructor,
    private props: TProps,
    private readonly session: SessionRuntimeStateInterface | null = null,
  ) {
    this.metadata = getWidgetMetadata<TProps>(widget);
    this.owner = {
      instanceId: createRuntimeInstanceId('widget'),
      kind: 'widget',
      token: widget,
    };
  }

  async action<TPayload = unknown>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    options: WidgetRuntimeActionOptions = {},
  ): Promise<unknown> {
    const widgetRuntime = this.currentWidgetRuntime;
    const controller = widgetRuntime?.controllers.get(controllerToken);

    if (!widgetRuntime || !controller) {
      throw new Error('Контроллер виджета недоступен.');
    }

    const action = controller.action;

    if (!action) {
      throw new Error('Действие контроллера виджета недоступно.');
    }

    if (this.actionAbortControllers.has(controllerToken)) {
      throw new Error('Действие виджета уже выполняется.');
    }

    const abortController = new AbortController();
    const externalSignal = options.signal;
    const abortAction = (): void => {
      abortController.abort();
    };

    if (externalSignal?.aborted) {
      abortController.abort();
    } else {
      externalSignal?.addEventListener('abort', abortAction, { once: true });
    }

    this.actionAbortControllers.set(controllerToken, abortController);
    this.setActionState(controllerToken, {
      data: undefined,
      error: undefined,
      inProcess: true,
    });

    try {
      const result = await executeRuntimeOperation({
        guard: this.createOperationGuard(),
        operation: async () => {
          this.throwIfAborted(abortController.signal, 'Widget action был прерван.');

          const actionArgs = this.createWidgetControllerActionArgs(payload, abortController.signal);
          const actionResult = await executeRuntimeParticipant(
            {
              operation: 'action',
              owner: this.owner,
              participant: { kind: 'controller', token: controllerToken },
            },
            () =>
              executeGuardedMethod({
                context: actionArgs,
                execute: () => {
                  return action.call(controller, actionArgs);
                },
                method: 'action',
                scope: widgetRuntime.scope,
                target: controller,
                token: controllerToken,
              }),
          );

          this.throwIfAborted(abortController.signal, 'Widget action был прерван.');

          return actionResult;
        },
        signal: abortController.signal,
        source: this.createRuntimeSource('action'),
      });

      const actionResult = await this.applyActionOperationResult(result);

      this.setActionState(controllerToken, {
        data: actionResult,
        error: undefined,
        inProcess: false,
      });

      return actionResult;
    } catch (error) {
      this.setActionState(controllerToken, {
        data: undefined,
        error,
        inProcess: false,
      });

      throw error;
    } finally {
      if (this.actionAbortControllers.get(controllerToken) === abortController) {
        this.actionAbortControllers.delete(controllerToken);
      }

      externalSignal?.removeEventListener('abort', abortAction);
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise;
    }

    if (this.snapshot.phase === 'disposed') {
      return Promise.resolve();
    }

    this.stateMachine.toDisposing();
    this.loadAbortController?.abort();
    this.abortActionControllers();
    this.emit();

    const widgetRuntime = this.currentWidgetRuntime;

    this.currentWidgetRuntime = null;
    this.disposePromise = this.disposeWidgetRuntime(widgetRuntime)
      .finally(() => {
        this.stateMachine.toDisposed();
        this.emit();
      })
      .finally(() => {
        this.disposePromise = null;
      });

    return this.disposePromise;
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    const controller = this.currentWidgetRuntime?.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер виджета недоступен.');
    }

    return controller as TController;
  }

  getControllers(): ReadonlyMap<DependencyToken<unknown>, WidgetControllerInterface<TProps>> {
    return this.currentWidgetRuntime?.controllers ?? new Map();
  }

  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue {
    const loaderData = this.currentWidgetRuntime?.loaderData;

    if (!loaderData) {
      throw new Error('Данные загрузчика виджета недоступны.');
    }

    return getControllerLoaderData<TValue>(loaderData, controllerToken);
  }

  getProps(): TProps {
    return this.props;
  }

  getRevalidateService(): RevalidateServiceInterface {
    const service = this.currentWidgetRuntime?.scope.get(RevalidateServiceInterface);

    if (!service) {
      throw new Error('Сервис обновления виджета недоступен.');
    }

    return service;
  }

  getRevalidateRevision(): number {
    return this.revalidateRevision;
  }

  getRevalidateState(key?: DependencyToken<unknown>): WidgetRuntimeRevalidateState {
    if (key !== undefined) {
      const state = this.revalidateStates.get(key) ?? DEFAULT_REVALIDATE_STATE;

      return {
        error: state.error ?? this.revalidateState.error,
        inProcess: state.inProcess || this.revalidateState.inProcess,
      };
    }

    let error = this.revalidateState.error;
    let inProcess = this.revalidateState.inProcess;

    for (const state of this.revalidateStates.values()) {
      error ??= state.error;
      inProcess ||= state.inProcess;
    }

    return {
      error,
      inProcess,
    };
  }

  getSnapshot(): WidgetRuntimeSnapshot {
    return this.snapshot;
  }

  async failRender(error: unknown): Promise<void> {
    if (this.snapshot.phase === 'disposing' || this.snapshot.phase === 'disposed') {
      return;
    }

    this.renderFailed = true;
    const activeRuntime = this.currentWidgetRuntime;
    const didFail = this.stateMachine.toRenderFailed(error);

    if (didFail) {
      this.loadAbortController?.abort();
      this.currentWidgetRuntime = null;
      this.emit();
    }

    await this.reportFailure(
      captureRuntimeFailure(error, this.createRuntimeSource('render')),
      'widget.failed',
      'failed',
    );

    if (didFail) {
      await this.disposeWidgetRuntime(activeRuntime);
    }
  }

  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>): WidgetRuntimeActionState<TResult> {
    return (this.actionStates.get(controllerToken) ?? DEFAULT_ACTION_STATE) as WidgetRuntimeActionState<TResult>;
  }

  async load(options: WidgetRuntimeLoadOptions = {}): Promise<void> {
    if (this.snapshot.phase === 'ready' || this.renderFailed) {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    const sessionId = this.stateMachine.startLoading();
    const abortController = new AbortController();
    const externalSignal = options.signal;
    const abortLoad = (): void => {
      abortController.abort();
    };

    if (externalSignal?.aborted) {
      abortController.abort();
    } else {
      externalSignal?.addEventListener('abort', abortLoad, { once: true });
    }

    this.loadAbortController = abortController;
    this.emit();

    const widgetRuntime = this.createWidgetRuntime();

    this.currentWidgetRuntime = widgetRuntime;
    this.loadPromise = executeRuntimeOperation({
      guard: this.createOperationGuard(),
      operation: async () => {
        await this.loadWidgetRuntime(widgetRuntime, abortController.signal);

        this.throwIfAborted(abortController.signal);
      },
      signal: abortController.signal,
      source: this.createRuntimeSource('load'),
    })
      .then(async (result) => {
        if (result.type === 'interrupted') {
          if (this.stateMachine.toIdle(sessionId)) {
            this.currentWidgetRuntime = null;
            await this.disposeWidgetRuntime(widgetRuntime);
            this.emit();
          }

          return;
        }

        if (result.type === 'failed') {
          if (this.stateMachine.toFailed(sessionId, result.failure.cause)) {
            this.currentWidgetRuntime = null;
            this.emit();
            await this.reportFailure(result.failure, 'widget.failed', 'failed');
            await this.disposeWidgetRuntime(widgetRuntime);
          }

          throw result.failure.cause;
        }

        this.throwIfAborted(abortController.signal);

        if (!this.stateMachine.toReady(sessionId)) {
          throw new Error('Загрузка виджета была прервана.');
        }

        this.emit();
      })
      .finally(() => {
        externalSignal?.removeEventListener('abort', abortLoad);

        if (this.loadAbortController === abortController) {
          this.loadAbortController = null;
        }

        this.loadPromise = null;
      });

    return this.loadPromise;
  }

  setProps(props: TProps): void {
    this.props = props;
  }

  async revalidate(options: WidgetRuntimeRevalidateOptions = {}): Promise<void> {
    const widgetRuntime = this.currentWidgetRuntime;
    const controllerToken = options.controllerToken;

    if (!widgetRuntime || this.snapshot.phase !== 'ready') {
      throw new Error('Runtime виджета не готов.');
    }

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

    this.setRevalidateState(controllerToken, {
      error: undefined,
      inProcess: true,
    });

    try {
      const result = await executeRuntimeOperation({
        guard: this.createOperationGuard(),
        operation: async () => {
          this.throwIfAborted(abortController.signal, 'Widget revalidation был прерван.');
          await this.runProviderBeforeLoad(widgetRuntime, abortController.signal);
          this.throwIfAborted(abortController.signal, 'Widget revalidation был прерван.');

          const loaderData = await this.loadControllers(widgetRuntime, abortController.signal, controllerToken);

          this.throwIfAborted(abortController.signal, 'Widget revalidation был прерван.');
          await this.runProviderBeforeRender(widgetRuntime, abortController.signal);
          this.throwIfAborted(abortController.signal, 'Widget revalidation был прерван.');

          return loaderData;
        },
        signal: abortController.signal,
        source: this.createRuntimeSource('revalidate'),
      });

      await this.applyRevalidateOperationResult(widgetRuntime, result, controllerToken);
      this.setRevalidateState(controllerToken, DEFAULT_REVALIDATE_STATE);
    } catch (error) {
      this.setRevalidateState(controllerToken, {
        error,
        inProcess: false,
      });

      throw error;
    } finally {
      externalSignal?.removeEventListener('abort', abortRevalidate);
    }
  }

  subscribe(listener: WidgetRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private abortActionControllers(): void {
    for (const abortController of this.actionAbortControllers.values()) {
      abortController.abort();
    }
  }

  private createProviderContext(scope: WidgetScope, signal: AbortSignal): RuntimeProviderPipelineContext<TProps> {
    return {
      params: {},
      props: this.props,
      request: createWidgetProviderRequest(signal),
      scope,
      signal,
    };
  }

  private createWidgetRuntime(): ActiveWidgetRuntime<TProps> {
    const scope = new WidgetScope(this.ownerScope, (registry) => {
      registry.bind(RevalidateServiceInterface).toConstantValue(
        new RuntimeRevalidateService((key, options) =>
          this.revalidate({
            controllerToken: key,
            signal: options?.signal,
          }),
        ),
      );
    });

    try {
      scope.activate(this.widget, { collectControllerBindings: true });

      const providerPipeline = new RuntimeProviderPipeline(scope, this.metadata.providers ?? [], this.owner);
      const controllers = this.resolveControllers(scope);

      return {
        controllers,
        loaderData: createControllerLoaderData([]),
        metadata: this.metadata,
        providerPipeline,
        scope,
        widget: this.widget,
      };
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }

  private async disposeWidgetRuntime(widgetRuntime: ActiveWidgetRuntime<TProps> | null): Promise<void> {
    if (!widgetRuntime) {
      return;
    }

    const controllerResults = await Promise.allSettled(
      [...widgetRuntime.controllers.values()].map((controller) => {
        return Promise.resolve().then(() => controller.dispose?.());
      }),
    );
    await Promise.all(
      controllerResults.map((result) => {
        return result.status === 'rejected'
          ? this.reportCleanupFailure(result.reason, 'controller.dispose')
          : Promise.resolve();
      }),
    );
    await widgetRuntime.providerPipeline.dispose();

    try {
      widgetRuntime.scope.dispose();
    } catch (error) {
      await this.reportCleanupFailure(error, 'scope.dispose');
    }
  }

  private emit(): void {
    this.snapshot = this.stateMachine.getSnapshot();
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private setActionState(controllerToken: DependencyToken<unknown>, state: WidgetRuntimeActionState): void {
    this.actionStates.set(controllerToken, state);
    this.emit();
  }

  private setRevalidateState(key: DependencyToken<unknown> | undefined, state: WidgetRuntimeRevalidateState): void {
    if (key === undefined) {
      this.revalidateState = state;
    } else {
      this.revalidateStates.set(key, state);
    }

    this.revalidateRevision++;
    this.emit();
  }

  private async loadControllers(
    widgetRuntime: ActiveWidgetRuntime<TProps>,
    signal: AbortSignal,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<ControllerLoaderData> {
    const controllers = getControllerEntries(
      widgetRuntime.controllers,
      controllerToken,
      'Контроллер виджета недоступен.',
    );
    const entries = await Promise.all(
      controllers.map(async ([controllerToken, controller]) => {
        const loaderArgs = this.createWidgetControllerArgs(signal);
        const value =
          controller?.loader === undefined
            ? void 0
            : await executeRuntimeParticipant(
                {
                  operation: 'loader',
                  owner: this.owner,
                  participant: { kind: 'controller', token: controllerToken },
                },
                () =>
                  executeGuardedMethod({
                    context: loaderArgs,
                    execute: () => {
                      return controller.loader?.(loaderArgs);
                    },
                    method: 'loader',
                    scope: widgetRuntime.scope,
                    target: controller,
                    token: controllerToken,
                  }),
              );

        return {
          actionKey: createControllerActionKey(controllerToken),
          controller: controllerToken,
          value,
        };
      }),
    );

    return createControllerLoaderData(entries);
  }

  private async loadWidgetRuntime(widgetRuntime: ActiveWidgetRuntime<TProps>, signal: AbortSignal): Promise<void> {
    this.throwIfAborted(signal);
    await this.runProviderBeforeLoad(widgetRuntime, signal);
    this.throwIfAborted(signal);

    const loaderData = await this.loadControllers(widgetRuntime, signal);

    this.throwIfAborted(signal);
    await widgetRuntime.providerPipeline.setup(this.createProviderContext(widgetRuntime.scope, signal));
    this.throwIfAborted(signal);
    await this.runProviderBeforeRender(widgetRuntime, signal);
    this.throwIfAborted(signal);

    Object.assign(widgetRuntime, {
      loaderData,
    });
  }

  private createWidgetControllerArgs(signal: AbortSignal): WidgetControllerLoaderArgs<TProps> {
    return {
      props: this.props,
      signal,
    };
  }

  private createWidgetControllerActionArgs<TPayload>(
    payload: TPayload,
    signal: AbortSignal,
  ): WidgetControllerActionArgs<TProps, TPayload> {
    return {
      payload,
      props: this.props,
      signal,
    };
  }

  private resolveControllers(scope: WidgetScope): Map<DependencyToken<unknown>, WidgetControllerInterface<TProps>> {
    const controllers = new Map<DependencyToken<unknown>, WidgetControllerInterface<TProps>>();

    for (const controllerToken of scope.getControllerTokens()) {
      controllers.set(controllerToken, scope.get(controllerToken) as WidgetControllerInterface<TProps>);
    }

    return controllers;
  }

  private async runProviderBeforeLoad(widgetRuntime: ActiveWidgetRuntime<TProps>, signal: AbortSignal): Promise<void> {
    const context = this.createProviderContext(widgetRuntime.scope, signal);

    await widgetRuntime.providerPipeline.runBeforeLoad(context);
  }

  private async runProviderBeforeRender(
    widgetRuntime: ActiveWidgetRuntime<TProps>,
    signal: AbortSignal,
  ): Promise<void> {
    const context = this.createProviderContext(widgetRuntime.scope, signal);

    await widgetRuntime.providerPipeline.runBeforeRender(context);
  }

  private throwIfAborted(signal: AbortSignal, message = 'Загрузка виджета была прервана.'): void {
    if (signal.aborted) {
      throw new Error(message);
    }
  }

  private async applyActionOperationResult(result: RuntimeOperationResult<unknown>): Promise<unknown> {
    switch (result.type) {
      case 'completed':
        return result.value;
      case 'interrupted':
        return void 0;
      case 'failed':
        await this.reportFailure(result.failure, 'action.failed', 'active');
        throw result.failure.cause;
    }
  }

  private async applyRevalidateOperationResult(
    widgetRuntime: ActiveWidgetRuntime<TProps>,
    result: RuntimeOperationResult<ControllerLoaderData>,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<void> {
    switch (result.type) {
      case 'completed':
        Object.assign(widgetRuntime, {
          loaderData:
            controllerToken === undefined
              ? result.value
              : mergeControllerLoaderData(widgetRuntime.loaderData, result.value),
        });
        this.emit();
        return;
      case 'interrupted':
        return;
      case 'failed':
        await this.reportFailure(result.failure, 'revalidate.failed', 'active');
        throw result.failure.cause;
    }
  }

  private createOperationGuard(): RuntimeOperationGuard | null {
    return this.session === null ? null : createRuntimeRevisionGuard(this.session);
  }

  private createRuntimeSource(operation: string) {
    return {
      operation,
      owner: this.owner,
      participant: { kind: 'runtime' } as const,
    };
  }

  private async reportFailure(
    failure: RuntimeFailure,
    disposition: RuntimeFailureDisposition,
    ownerState: string,
  ): Promise<void> {
    await reportRuntimeFailure(
      this.ownerScope.get(RuntimeFailureReporterInterface),
      failure,
      this.owner,
      disposition,
      ownerState,
    );
  }

  private async reportCleanupFailure(error: unknown, operation: string): Promise<void> {
    await this.reportFailure(
      captureRuntimeFailure(error, this.createRuntimeSource(operation)),
      'cleanup.contained',
      'disposing',
    );
  }
}

const DEFAULT_ACTION_STATE: WidgetRuntimeActionState = {
  data: undefined,
  error: undefined,
  inProcess: false,
};

const DEFAULT_REVALIDATE_STATE: WidgetRuntimeRevalidateState = {
  error: undefined,
  inProcess: false,
};

const createWidgetProviderRequest = (signal: AbortSignal): Request => {
  return new Request('http://localhost/widget-runtime', {
    signal,
  });
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
