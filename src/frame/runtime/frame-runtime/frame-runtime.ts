import {
  createControllerLoaderData,
  getControllerLoaderData,
  mergeControllerLoaderData,
  type ControllerLoaderData,
} from '../../../controller/data/controller-loader-data';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { executeGuardedMethod } from '../../../guard/runtime/guard-method-executor';
import { getLayoutMetadata } from '../../../layout/declaration/layout';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { PolicyBoundaryDecision } from '../../../policy/contract/policy-boundary-decision';
import { PolicyRunner } from '../../../policy/runtime/policy-runner';
import type { NavigateServiceInterface } from '../../../router/service/navigate-service';
import type { RouterLocationSnapshot } from '../../../router/service/location-service';
import type { RouteRuntimeContextInterface } from '../../../router/runtime/route-runtime-context';
import {
  createRuntimeRevisionGuard,
  executeRuntimeParticipant,
  executeRuntimeOperation,
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
import { FrameScope } from '../../../runtime/scope/kind';
import {
  RuntimeProviderPipeline,
  type RuntimeProviderPipelineContext,
} from '../../../runtime/provider/runtime-provider-pipeline';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';
import type { RuntimeScope } from '../../../runtime/scope/base';
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';
import { RuntimeRevalidateService } from '../../../revalidate/runtime/revalidate-service';
import { getFrameMetadata, type FrameConstructor, type FrameMetadata } from '../../declaration/frame';
import { createFrameNavigationEntry } from '../../navigation/frame-navigation-state';
import { FrameServiceInterface, type FrameOpenArgs } from '../../service/frame-service';
import type { FrameSourceCloseHandler } from '../../source/frame-source';

import type {
  FrameControllerActionArgs,
  FrameControllerInterface,
  FrameControllerLoaderArgs,
} from '../frame-controller';

interface ActiveFrameRuntime<TProps extends object = object> {
  readonly controllers: Map<DependencyToken<unknown>, FrameControllerInterface<TProps>>;
  readonly loadOptions: Required<FrameRuntimeLoadOptions>;
  loaderData: ControllerLoaderData;
  readonly metadata: FrameMetadata<TProps>;
  readonly frame: FrameConstructor<TProps>;
  providerPipeline: RuntimeProviderPipeline<TProps> | null;
  readonly scope: FrameScope;
}

export interface FrameRuntimeLoadOptions {
  readonly app: ApplicationControllerInterface;
  readonly close: FrameSourceCloseHandler;
  readonly location: RouterLocationSnapshot;
  readonly navigateService: NavigateServiceInterface;
  readonly session: SessionRuntimeStateInterface;
  readonly signal?: AbortSignal;
}

export interface FrameRuntimeActionOptions {
  readonly signal?: AbortSignal;
}

interface FrameRuntimeActionState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

export interface FrameRuntimeRevalidateOptions {
  readonly controllerToken?: DependencyToken<unknown>;
  readonly signal?: AbortSignal;
}

export type FrameRuntimePhase = 'disposed' | 'disposing' | 'failed' | 'forbidden' | 'idle' | 'loading' | 'ready';

export interface FrameRuntimeSnapshot {
  readonly error: unknown | null;
  readonly phase: FrameRuntimePhase;
}

type FrameRuntimeListener = () => void;

export class FrameRuntime<TProps extends object = Record<string, never>> {
  private readonly listeners = new Set<FrameRuntimeListener>();
  private readonly metadata: FrameMetadata<TProps>;
  private readonly owner: RuntimeOwner;

  private readonly actionAbortControllers = new Map<DependencyToken<unknown>, AbortController>();
  private readonly actionStates = new Map<DependencyToken<unknown>, FrameRuntimeActionState>();
  private currentFrameRuntime: ActiveFrameRuntime<TProps> | null = null;
  private disposePromise: Promise<void> | null = null;
  private loadAbortController: AbortController | null = null;
  private loadPromise: Promise<void> | null = null;
  private loadSessionCounter = 0;
  private selfCloseRequested = false;
  private snapshot: FrameRuntimeSnapshot = {
    error: null,
    phase: 'idle',
  };

  constructor(
    private readonly ownerScope: RuntimeScope,
    private readonly frame: FrameConstructor<TProps>,
    private readonly props: TProps,
  ) {
    this.metadata = getFrameMetadata<TProps>(frame);
    this.owner = {
      instanceId: createRuntimeInstanceId('frame'),
      kind: 'frame',
      token: frame,
    };
  }

  async action<TPayload = unknown>(
    controllerToken: DependencyToken<unknown>,
    payload: TPayload,
    options: FrameRuntimeActionOptions = {},
  ): Promise<unknown> {
    const frameRuntime = this.currentFrameRuntime;
    const controller = frameRuntime?.controllers.get(controllerToken);

    if (!frameRuntime || !controller) {
      throw new Error('Контроллер фрейма недоступен.');
    }

    const action = controller.action;

    if (!action) {
      throw new Error('Действие контроллера фрейма недоступно.');
    }

    if (this.actionAbortControllers.has(controllerToken)) {
      throw new Error('Действие фрейма уже выполняется.');
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
        guard: createRuntimeRevisionGuard(frameRuntime.loadOptions.session),
        operation: async () => {
          this.throwIfAborted(abortController.signal, 'Frame action был прерван.');
          this.selfCloseRequested = false;

          const actionArgs = this.createFrameControllerActionArgs(frameRuntime, payload, abortController.signal);
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
                scope: frameRuntime.scope,
                target: controller,
                token: controllerToken,
              }),
          );

          if (!this.selfCloseRequested) {
            this.throwIfAborted(abortController.signal, 'Frame action был прерван.');
          }

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

      this.selfCloseRequested = false;
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

    this.loadAbortController?.abort();
    this.abortActionControllers();
    this.loadSessionCounter++;
    this.setSnapshot({
      error: null,
      phase: 'disposing',
    });

    const frameRuntime = this.currentFrameRuntime;

    this.currentFrameRuntime = null;
    this.disposePromise = this.disposeFrameRuntime(frameRuntime)
      .finally(() => {
        this.setSnapshot({
          error: null,
          phase: 'disposed',
        });
      })
      .finally(() => {
        this.disposePromise = null;
      });

    return this.disposePromise;
  }

  getActiveRuntimeOrNull(): ActiveFrameRuntime<TProps> | null {
    return this.currentFrameRuntime;
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    const controller = this.currentFrameRuntime?.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер фрейма недоступен.');
    }

    return controller as TController;
  }

  getControllers(): ReadonlyMap<DependencyToken<unknown>, FrameControllerInterface<TProps>> {
    return this.currentFrameRuntime?.controllers ?? new Map();
  }

  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue {
    const loaderData = this.currentFrameRuntime?.loaderData;

    if (!loaderData) {
      throw new Error('Данные загрузчика фрейма недоступны.');
    }

    return getControllerLoaderData<TValue>(loaderData, controllerToken);
  }

  getRevalidateService(): RevalidateServiceInterface {
    const service = this.currentFrameRuntime?.scope.get(RevalidateServiceInterface);

    if (!service) {
      throw new Error('Сервис обновления фрейма недоступен.');
    }

    return service;
  }

  getSnapshot(): FrameRuntimeSnapshot {
    return this.snapshot;
  }

  async failRender(error: unknown): Promise<void> {
    if (this.snapshot.phase === 'disposing' || this.snapshot.phase === 'disposed') {
      return;
    }

    if (this.snapshot.phase !== 'failed') {
      this.loadAbortController?.abort();
      this.loadSessionCounter++;
      this.setSnapshot({
        error,
        phase: 'failed',
      });
    }

    await this.reportFailure(
      captureRuntimeFailure(error, this.createRuntimeSource('render')),
      'frame.failed',
      'failed',
    );
  }

  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>): FrameRuntimeActionState<TResult> {
    return (this.actionStates.get(controllerToken) ?? DEFAULT_ACTION_STATE) as FrameRuntimeActionState<TResult>;
  }

  async load(options: FrameRuntimeLoadOptions): Promise<void> {
    if (this.snapshot.phase === 'ready' || this.snapshot.phase === 'failed' || this.snapshot.phase === 'forbidden') {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    const abortController = new AbortController();
    const sessionId = ++this.loadSessionCounter;
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
    this.setSnapshot({
      error: null,
      phase: 'loading',
    });

    const operationGuard = createRuntimeRevisionGuard(options.session);
    const loadOptions: Required<FrameRuntimeLoadOptions> = {
      ...options,
      signal: abortController.signal,
    };
    let frameRuntime: ActiveFrameRuntime<TProps>;

    try {
      frameRuntime = this.createFrameRuntime(loadOptions);
      this.currentFrameRuntime = frameRuntime;
      this.resolveFrameRuntimeDependencies(frameRuntime);
    } catch (error) {
      externalSignal?.removeEventListener('abort', abortLoad);

      if (this.loadAbortController === abortController) {
        this.loadAbortController = null;
      }

      const failure = captureRuntimeFailure(error, this.createRuntimeSource('create'));

      if (this.isLoadSessionActive(sessionId)) {
        this.setSnapshot({
          error: failure.cause,
          phase: 'failed',
        });

        await this.reportFailure(failure, 'frame.failed', 'failed');
      }

      throw failure.cause;
    }

    this.loadPromise = executeRuntimeOperation({
      guard: operationGuard,
      operation: async () => {
        await this.executePolicies('canActivate', frameRuntime);
        await this.loadFrameRuntime(frameRuntime);

        this.throwIfAborted(abortController.signal);
      },
      signal: abortController.signal,
      source: this.createRuntimeSource('load'),
    })
      .then(async (result) => {
        if (!this.isLoadSessionActive(sessionId)) {
          return;
        }

        if (result.type === 'interrupted') {
          this.setSnapshot({
            error: null,
            phase: 'idle',
          });

          return;
        }

        if (result.type === 'failed') {
          const decision = resolveFramePolicyDecision(result.failure.cause);

          if (decision?.type === 'forbidden') {
            this.setSnapshot({
              error: null,
              phase: 'forbidden',
            });

            return;
          }

          this.setSnapshot({
            error: result.failure.cause,
            phase: 'failed',
          });

          await this.reportFailure(result.failure, 'frame.failed', 'failed');
          throw result.failure.cause;
        }

        if (result.type === 'rejected') {
          if (result.error instanceof Error && 'status' in result.error && result.error.status === 403) {
            this.setSnapshot({ error: null, phase: 'forbidden' });
            return;
          }

          this.setSnapshot({ error: result.error, phase: 'failed' });
          throw result.error;
        }

        this.throwIfAborted(abortController.signal);
        this.setSnapshot({
          error: null,
          phase: 'ready',
        });
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

  async revalidate(options: FrameRuntimeRevalidateOptions = {}): Promise<void> {
    const frameRuntime = this.currentFrameRuntime;
    const controllerToken = options.controllerToken;

    if (!frameRuntime || this.snapshot.phase !== 'ready') {
      throw new Error('Runtime фрейма не готов.');
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

    try {
      const result = await executeRuntimeOperation({
        guard: createRuntimeRevisionGuard(frameRuntime.loadOptions.session),
        operation: async () => {
          this.throwIfAborted(abortController.signal, 'Обновление фрейма было прервано.');
          await this.runProviderBeforeLoad(frameRuntime, abortController.signal);
          this.throwIfAborted(abortController.signal, 'Обновление фрейма было прервано.');

          const loaderData = await this.loadControllers(frameRuntime, abortController.signal, controllerToken);

          this.throwIfAborted(abortController.signal, 'Обновление фрейма было прервано.');
          await this.runProviderBeforeRender(frameRuntime, {
            ...frameRuntime.loadOptions,
            signal: abortController.signal,
          });
          this.throwIfAborted(abortController.signal, 'Обновление фрейма было прервано.');

          return loaderData;
        },
        signal: abortController.signal,
        source: this.createRuntimeSource('revalidate'),
      });

      await this.applyRevalidateOperationResult(frameRuntime, result, controllerToken);
    } finally {
      externalSignal?.removeEventListener('abort', abortRevalidate);
    }
  }

  subscribe(listener: FrameRuntimeListener): () => void {
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

  private createFrameRuntime(loadOptions: Required<FrameRuntimeLoadOptions>): ActiveFrameRuntime<TProps> {
    const frameService = this.ownerScope.get(FrameServiceInterface);
    const scope = new FrameScope(this.ownerScope, (registry) => {
      registry.bind(FrameServiceInterface).toConstantValue(
        new CurrentFrameService(
          frameService,
          createFrameNavigationEntry(this.metadata.source?.getNavigationKey() ?? getFrameName(this.frame), this.props),
          () => this.backCurrentFrame(),
          () => this.closeCurrentFrame(loadOptions),
        ),
      );
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
      scope.activate(this.frame, { collectControllerBindings: true });
      this.activateLayouts(scope);

      return {
        controllers: new Map(),
        frame: this.frame,
        loaderData: createControllerLoaderData([]),
        loadOptions,
        metadata: this.metadata,
        providerPipeline: null,
        scope,
      };
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }

  private resolveFrameRuntimeDependencies(frameRuntime: ActiveFrameRuntime<TProps>): void {
    for (const [controllerToken, controller] of this.resolveControllers(frameRuntime.scope)) {
      frameRuntime.controllers.set(controllerToken, controller);
    }

    frameRuntime.providerPipeline = new RuntimeProviderPipeline(
      frameRuntime.scope,
      this.getProviderTokens(),
      this.owner,
    );
  }

  private activateLayouts(scope: FrameScope): void {
    this.metadata.layouts?.forEach((layout) => {
      scope.activate(layout);
    });
  }

  private getProviderTokens(): readonly ProviderToken<TProps>[] {
    return [
      ...(this.metadata.providers ?? []),
      ...(this.metadata.layouts ?? []).flatMap((layout) => {
        return getLayoutMetadata(layout).providers ?? [];
      }),
    ];
  }

  private async disposeFrameRuntime(frameRuntime: ActiveFrameRuntime<TProps> | null): Promise<void> {
    if (!frameRuntime) {
      return;
    }

    const controllerResults = await Promise.allSettled(
      [...frameRuntime.controllers.values()].map((controller) => {
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
    await frameRuntime.providerPipeline?.dispose();

    try {
      frameRuntime.scope.dispose();
    } catch (error) {
      await this.reportCleanupFailure(error, 'scope.dispose');
    }
  }

  private async loadFrameRuntime(frameRuntime: ActiveFrameRuntime<TProps>): Promise<void> {
    const options = frameRuntime.loadOptions;

    this.throwIfAborted(options.signal);
    await this.runProviderBeforeLoad(frameRuntime, options.signal);
    this.throwIfAborted(options.signal);

    const loaderData = await this.loadControllers(frameRuntime, options.signal);

    this.throwIfAborted(options.signal);
    await this.getProviderPipeline(frameRuntime).setup(createProviderContext(frameRuntime.scope, this.props, options));
    this.throwIfAborted(options.signal);
    await this.runProviderBeforeRender(frameRuntime, options);
    this.throwIfAborted(options.signal);

    Object.assign(frameRuntime, {
      loaderData,
    });
  }

  private async loadControllers(
    frameRuntime: ActiveFrameRuntime<TProps>,
    signal: AbortSignal,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<ControllerLoaderData> {
    const controllers = getControllerEntries(
      frameRuntime.controllers,
      controllerToken,
      'Контроллер фрейма недоступен.',
    );
    const entries = await Promise.all(
      controllers.map(async ([controllerToken, controller]) => {
        const loaderArgs = this.createFrameControllerLoaderArgs(frameRuntime, signal);
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
                    scope: frameRuntime.scope,
                    target: controller,
                    token: controllerToken,
                  }),
              );

        return {
          controller: controllerToken,
          value,
        };
      }),
    );

    return createControllerLoaderData(entries);
  }

  private resolveControllers(scope: FrameScope): Map<DependencyToken<unknown>, FrameControllerInterface<TProps>> {
    const controllers = new Map<DependencyToken<unknown>, FrameControllerInterface<TProps>>();

    for (const controllerToken of scope.getControllerTokens()) {
      controllers.set(controllerToken, scope.get(controllerToken) as FrameControllerInterface<TProps>);
    }

    return controllers;
  }

  private async runProviderBeforeRender(
    frameRuntime: ActiveFrameRuntime<TProps>,
    options: Required<FrameRuntimeLoadOptions>,
  ): Promise<void> {
    const context = createProviderContext(frameRuntime.scope, this.props, options);

    await this.getProviderPipeline(frameRuntime).runBeforeRender(context);
  }

  private async runProviderBeforeLoad(frameRuntime: ActiveFrameRuntime<TProps>, signal: AbortSignal): Promise<void> {
    const context = createProviderContext(frameRuntime.scope, this.props, {
      ...frameRuntime.loadOptions,
      signal,
    });

    await this.getProviderPipeline(frameRuntime).runBeforeLoad(context);
  }

  private async executePolicies(boundary: 'canActivate', frameRuntime: ActiveFrameRuntime<TProps>): Promise<void> {
    const declarations = this.metadata[boundary] ?? [];

    if (declarations.length === 0) {
      return;
    }

    const policyRunner = new PolicyRunner<RouteRuntimeContextInterface>(this.ownerScope, this.owner);
    const decision = await policyRunner.execute(declarations, this.createPolicyContext(frameRuntime));

    this.applyPolicyDecision(decision);
  }

  private createPolicyContext(frameRuntime: ActiveFrameRuntime<TProps>): RouteRuntimeContextInterface {
    return {
      app: frameRuntime.loadOptions.app,
      params: frameRuntime.loadOptions.location.params,
      request: createProviderRequest(frameRuntime.loadOptions.location, frameRuntime.loadOptions.signal),
      session: frameRuntime.loadOptions.session,
      signal: frameRuntime.loadOptions.signal,
    };
  }

  private applyPolicyDecision(decision: PolicyBoundaryDecision): void {
    switch (decision.type) {
      case 'continue':
        return;
      case 'forbidden':
        throw createFramePolicyDecision(decision);
      case 'not-found':
        throw createFramePolicyDecision(decision);
      case 'error':
        throw decision.error;
      case 'redirect':
      case 'redirect-and-save-location':
      case 'redirect-to-saved-location':
        throw new Error('Фрейм не поддерживает навигационное решение policy.');
    }
  }

  private getProviderPipeline(frameRuntime: ActiveFrameRuntime<TProps>): RuntimeProviderPipeline<TProps> {
    if (frameRuntime.providerPipeline === null) {
      throw new Error('Pipeline провайдеров фрейма недоступен.');
    }

    return frameRuntime.providerPipeline;
  }

  private createFrameControllerLoaderArgs(
    frameRuntime: ActiveFrameRuntime<TProps>,
    signal: AbortSignal,
  ): FrameControllerLoaderArgs<TProps> {
    return {
      params: frameRuntime.loadOptions.location.params,
      props: this.props,
      request: createProviderRequest(frameRuntime.loadOptions.location, signal),
      signal,
    };
  }

  private createFrameControllerActionArgs<TPayload>(
    frameRuntime: ActiveFrameRuntime<TProps>,
    payload: TPayload,
    signal: AbortSignal,
  ): FrameControllerActionArgs<TProps, TPayload> {
    return {
      params: frameRuntime.loadOptions.location.params,
      payload,
      props: this.props,
      request: createProviderRequest(frameRuntime.loadOptions.location, signal),
      signal,
    };
  }

  private setSnapshot(snapshot: FrameRuntimeSnapshot): void {
    this.snapshot = snapshot;
    this.emit();
  }

  private setActionState(controllerToken: DependencyToken<unknown>, state: FrameRuntimeActionState): void {
    this.actionStates.set(controllerToken, state);
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private throwIfAborted(signal: AbortSignal, message = 'Рендеринг фрейма был прерван.'): void {
    if (signal.aborted) {
      throw new Error(message);
    }
  }

  private async closeCurrentFrame(loadOptions: Required<FrameRuntimeLoadOptions>): Promise<void> {
    this.selfCloseRequested = true;

    await loadOptions.close();
  }

  private async backCurrentFrame(): Promise<void> {
    this.selfCloseRequested = true;

    await this.ownerScope.get(FrameServiceInterface).back();
  }

  private isLoadSessionActive(sessionId: number): boolean {
    return (
      this.loadSessionCounter === sessionId && this.snapshot.phase !== 'disposed' && this.snapshot.phase !== 'disposing'
    );
  }

  private async applyActionOperationResult(result: RuntimeOperationResult<unknown>): Promise<unknown> {
    switch (result.type) {
      case 'completed':
        return result.value;
      case 'interrupted':
        return void 0;
      case 'rejected':
        throw result.error;
      case 'failed':
        await this.reportFailure(result.failure, 'action.failed', 'active');
        throw result.failure.cause;
    }
  }

  private async applyRevalidateOperationResult(
    frameRuntime: ActiveFrameRuntime<TProps>,
    result: RuntimeOperationResult<ControllerLoaderData>,
    controllerToken?: DependencyToken<unknown>,
  ): Promise<void> {
    switch (result.type) {
      case 'completed':
        Object.assign(frameRuntime, {
          loaderData:
            controllerToken === undefined
              ? result.value
              : mergeControllerLoaderData(frameRuntime.loaderData, result.value),
        });
        this.setSnapshot({ ...this.snapshot });
        return;
      case 'interrupted':
        return;
      case 'rejected':
        throw result.error;
      case 'failed':
        await this.reportFailure(result.failure, 'revalidate.failed', 'active');
        throw result.failure.cause;
    }
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

const DEFAULT_ACTION_STATE: FrameRuntimeActionState = {
  data: undefined,
  error: undefined,
  inProcess: false,
};

class CurrentFrameService extends FrameServiceInterface {
  constructor(
    private readonly frameService: FrameServiceInterface,
    private readonly parentEntry: ReturnType<typeof createFrameNavigationEntry>,
    private readonly backCurrentFrame: () => Promise<void>,
    private readonly closeCurrentFrame: () => Promise<void>,
  ) {
    super();
  }

  async back(): Promise<void>;
  async back<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;
  async back<TFrame extends FrameConstructor>(frame?: TFrame): Promise<void> {
    if (!frame) {
      await this.backCurrentFrame();
      return;
    }

    await this.frameService.back(frame);
  }

  async close(): Promise<void>;
  async close<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;
  async close<TFrame extends FrameConstructor>(frame?: TFrame): Promise<void> {
    if (!frame) {
      await this.closeCurrentFrame();
      return;
    }

    await this.frameService.close(frame);
  }

  hasParent(): boolean;
  hasParent<TFrame extends FrameConstructor>(frame: TFrame): boolean;
  hasParent<TFrame extends FrameConstructor>(frame?: TFrame): boolean {
    if (!frame) {
      return this.frameService.hasParent();
    }

    return this.frameService.hasParent(frame);
  }

  async open<TFrame extends FrameConstructor>(frame: TFrame, ...args: FrameOpenArgs<TFrame>): Promise<void> {
    await this.frameService.openFromFrame(this.parentEntry, frame, ...args);
  }

  async openFromFrame<TFrame extends FrameConstructor>(
    parentEntry: ReturnType<typeof createFrameNavigationEntry>,
    frame: TFrame,
    ...args: FrameOpenArgs<TFrame>
  ): Promise<void> {
    await this.frameService.openFromFrame(parentEntry, frame, ...args);
  }
}

const getFrameName = (frame: FrameConstructor): string => {
  if ('name' in frame && typeof frame.name === 'string' && frame.name.length > 0) {
    return frame.name;
  }

  return 'Frame';
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

const createProviderContext = <TProps extends object>(
  scope: FrameScope,
  props: TProps,
  options: Required<FrameRuntimeLoadOptions>,
): RuntimeProviderPipelineContext<TProps> => {
  return {
    params: options.location.params,
    props,
    request: createProviderRequest(options.location, options.signal),
    scope,
    signal: options.signal,
  };
};

const createProviderRequest = (location: RouterLocationSnapshot, signal: AbortSignal): Request => {
  return new Request(`http://localhost${location.pathname}${location.search}${location.hash}`, {
    signal,
  });
};

class FramePolicyDecisionException extends Error {
  constructor(readonly decision: Extract<PolicyBoundaryDecision, { readonly type: 'forbidden' | 'not-found' }>) {
    super(`Policy фрейма вернула решение ${decision.type}.`);
  }
}

const createFramePolicyDecision = (
  decision: Extract<PolicyBoundaryDecision, { readonly type: 'forbidden' | 'not-found' }>,
): FramePolicyDecisionException => {
  return new FramePolicyDecisionException(decision);
};

const resolveFramePolicyDecision = (error: unknown): PolicyBoundaryDecision | null => {
  if (error instanceof FramePolicyDecisionException) {
    return error.decision;
  }

  return null;
};
