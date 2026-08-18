import {
  createControllerLoaderData,
  getControllerLoaderData,
  mergeControllerLoaderData,
  type ControllerLoaderData,
} from '../../../controller/data/controller-loader-data';
import type {
  ControllerArgs,
  RuntimeController,
  WithParams,
  WithPayload,
} from '../../../controller/contract/controller';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { invokeControllerMethod } from '../../../controller/runtime';
import { executeGuardedMethod } from '../../../guard/runtime/guard-method-executor';
import { getLayoutMetadata } from '../../../layout/declaration/layout';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import {
  NavigateServiceInterface,
  type NavigateFrame,
  type RouterHashNavigateOptions,
  type RouterNavigateOptions,
  type RouterSearchNavigateOptions,
} from '../../../router/service/navigate-service';
import type { RouterHashObject } from '../../../router/utils/hash-utils';
import type { RouterSearchObject } from '../../../router/utils/search-utils';
import type { RouterLocationSnapshot } from '../../../router/service/location-service';
import {
  createRuntimeRevisionGuard,
  createRuntimeCompletionRevisionGuard,
  executeRuntimeParticipant,
  executeRuntimeOperation,
  RuntimeOperationCoordinator,
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

interface ActiveFrameRuntime {
  readonly controllers: Map<DependencyToken<unknown>, RuntimeController>;
  readonly loadOptions: Required<FrameRuntimeLoadOptions>;
  loaderData: ControllerLoaderData;
  readonly metadata: FrameMetadata;
  readonly frame: FrameConstructor;
  providerPipeline: RuntimeProviderPipeline | null;
  readonly scope: FrameScope;
}

export interface FrameRuntimeLoadOptions {
  readonly app: ApplicationControllerInterface;
  readonly location: RouterLocationSnapshot;
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

export class FrameRuntime {
  private readonly listeners = new Set<FrameRuntimeListener>();
  private readonly metadata: FrameMetadata;
  private readonly owner: RuntimeOwner;

  private readonly actionAbortControllers = new Map<DependencyToken<unknown>, AbortController>();
  private readonly actionStates = new Map<DependencyToken<unknown>, FrameRuntimeActionState>();
  private currentFrameRuntime: ActiveFrameRuntime | null = null;
  private disposePromise: Promise<void> | null = null;
  private loadAbortController: AbortController | null = null;
  private loadPromise: Promise<void> | null = null;
  private loadSessionCounter = 0;
  private selfNavigationRequested = false;
  private snapshot: FrameRuntimeSnapshot = {
    error: null,
    phase: 'idle',
  };

  constructor(
    private readonly ownerScope: RuntimeScope,
    private readonly frame: FrameConstructor,
  ) {
    this.metadata = getFrameMetadata(frame);
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
    return this.ownerScope
      .get(RuntimeOperationCoordinator)
      .run(() => this.executeAction(controllerToken, payload, options));
  }

  private async executeAction<TPayload = unknown>(
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
        guard: createRuntimeCompletionRevisionGuard(frameRuntime.loadOptions.session),
        operation: async () => {
          this.throwIfAborted(abortController.signal, 'Frame action был прерван.');
          this.selfNavigationRequested = false;

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

          if (!this.selfNavigationRequested) {
            this.throwIfAborted(abortController.signal, 'Frame action был прерван.');
          }

          return actionResult;
        },
        signal: abortController.signal,
        source: this.createRuntimeSource('action'),
      });

      const actionResult = await this.applyActionOperationResult(result);

      this.setActionState(controllerToken, {
        data: actionResult.data,
        error: actionResult.error,
        inProcess: false,
      });

      return actionResult.data;
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

      this.selfNavigationRequested = false;
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

  getActiveRuntimeOrNull(): ActiveFrameRuntime | null {
    return this.currentFrameRuntime;
  }

  getController<TController>(controllerToken: DependencyToken<TController>): TController {
    const controller = this.currentFrameRuntime?.controllers.get(controllerToken);

    if (!controller) {
      throw new Error('Контроллер фрейма недоступен.');
    }

    return controller as TController;
  }

  getControllers(): ReadonlyMap<DependencyToken<unknown>, RuntimeController> {
    return this.currentFrameRuntime?.controllers ?? new Map();
  }

  getParams(): Readonly<Record<string, string | undefined>> {
    return this.currentFrameRuntime?.loadOptions.location.params ?? EMPTY_PARAMS;
  }

  getRevalidateState(): { readonly error: unknown; readonly inProcess: boolean } {
    return EMPTY_REVALIDATE_STATE;
  }

  getRevalidateRevision(): number {
    return 0;
  }

  invoke<TValue>(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): TValue {
    const controller = this.getController(controllerToken) as object;

    return this.ownerScope.get(RuntimeOperationCoordinator).run(() =>
      invokeControllerMethod<TValue>({
        args,
        controller,
        method,
        owner: this.owner,
        token: controllerToken,
      }),
    );
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
    let frameRuntime: ActiveFrameRuntime;

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

        if (result.type === 'failed' || result.type === 'escalated') {
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

  private createFrameRuntime(loadOptions: Required<FrameRuntimeLoadOptions>): ActiveFrameRuntime {
    const navigateService = this.ownerScope.get(NavigateServiceInterface);
    const scope = new FrameScope(this.ownerScope, (registry) => {
      registry.bind(NavigateServiceInterface).toConstantValue(
        new ScopedNavigateService(navigateService, () => {
          this.selfNavigationRequested = true;
        }),
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

  private resolveFrameRuntimeDependencies(frameRuntime: ActiveFrameRuntime): void {
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

  private getProviderTokens(): readonly ProviderToken[] {
    return [
      ...(this.metadata.providers ?? []),
      ...(this.metadata.layouts ?? []).flatMap((layout) => {
        return getLayoutMetadata(layout).providers ?? [];
      }),
    ];
  }

  private async disposeFrameRuntime(frameRuntime: ActiveFrameRuntime | null): Promise<void> {
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

  private async loadFrameRuntime(frameRuntime: ActiveFrameRuntime): Promise<void> {
    const options = frameRuntime.loadOptions;

    this.throwIfAborted(options.signal);
    await this.runProviderBeforeLoad(frameRuntime, options.signal);
    this.throwIfAborted(options.signal);

    const loaderData = await this.loadControllers(frameRuntime, options.signal);

    this.throwIfAborted(options.signal);
    await this.getProviderPipeline(frameRuntime).setup(createProviderContext(frameRuntime.scope, options));
    this.throwIfAborted(options.signal);
    await this.runProviderBeforeRender(frameRuntime, options);
    this.throwIfAborted(options.signal);

    Object.assign(frameRuntime, {
      loaderData,
    });
  }

  private async loadControllers(
    frameRuntime: ActiveFrameRuntime,
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

  private resolveControllers(scope: FrameScope): Map<DependencyToken<unknown>, RuntimeController> {
    const controllers = new Map<DependencyToken<unknown>, RuntimeController>();

    for (const controllerToken of scope.getControllerTokens()) {
      controllers.set(controllerToken, scope.get(controllerToken) as RuntimeController);
    }

    return controllers;
  }

  private async runProviderBeforeRender(
    frameRuntime: ActiveFrameRuntime,
    options: Required<FrameRuntimeLoadOptions>,
  ): Promise<void> {
    const context = createProviderContext(frameRuntime.scope, options);

    await this.getProviderPipeline(frameRuntime).runBeforeRender(context);
  }

  private async runProviderBeforeLoad(frameRuntime: ActiveFrameRuntime, signal: AbortSignal): Promise<void> {
    const context = createProviderContext(frameRuntime.scope, {
      ...frameRuntime.loadOptions,
      signal,
    });

    await this.getProviderPipeline(frameRuntime).runBeforeLoad(context);
  }

  private getProviderPipeline(frameRuntime: ActiveFrameRuntime): RuntimeProviderPipeline {
    if (frameRuntime.providerPipeline === null) {
      throw new Error('Pipeline провайдеров фрейма недоступен.');
    }

    return frameRuntime.providerPipeline;
  }

  private createFrameControllerLoaderArgs(
    frameRuntime: ActiveFrameRuntime,
    signal: AbortSignal,
  ): ControllerArgs<WithParams<Record<string, string | undefined>>> {
    return {
      params: frameRuntime.loadOptions.location.params,
      signal,
    };
  }

  private createFrameControllerActionArgs<TPayload>(
    frameRuntime: ActiveFrameRuntime,
    payload: TPayload,
    signal: AbortSignal,
  ): ControllerArgs<WithPayload<TPayload, WithParams<Record<string, string | undefined>>>> {
    return {
      params: frameRuntime.loadOptions.location.params,
      payload,
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

  private isLoadSessionActive(sessionId: number): boolean {
    return (
      this.loadSessionCounter === sessionId && this.snapshot.phase !== 'disposed' && this.snapshot.phase !== 'disposing'
    );
  }

  private async applyActionOperationResult(result: RuntimeOperationResult<unknown>): Promise<ActionOperationResult> {
    switch (result.type) {
      case 'completed':
        return { data: result.value, error: undefined };
      case 'interrupted':
        return { data: undefined, error: undefined };
      case 'rejected':
        return { data: undefined, error: result.error };
      case 'failed':
        await this.reportFailure(result.failure, 'action.failed', 'active');
        return { data: undefined, error: result.failure.cause };
      case 'escalated':
        this.setSnapshot({
          error: result.failure.cause,
          phase: 'failed',
        });
        await this.reportFailure(result.failure, 'frame.failed', 'failed');

        return { data: undefined, error: undefined };
    }
  }

  private async applyRevalidateOperationResult(
    frameRuntime: ActiveFrameRuntime,
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
      case 'escalated':
        this.setSnapshot({
          error: result.failure.cause,
          phase: 'failed',
        });
        await this.reportFailure(result.failure, 'frame.failed', 'failed');
        return;
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

const EMPTY_PARAMS: Readonly<Record<string, string | undefined>> = {};

interface ActionOperationResult {
  readonly data: unknown;
  readonly error: unknown;
}

const EMPTY_REVALIDATE_STATE = {
  error: undefined,
  inProcess: false,
} as const;

class ScopedNavigateService implements NavigateServiceInterface {
  readonly frame: NavigateFrame = {
    close: async (options) => {
      this.onNavigate();
      await this.navigateService.frame.close(options);
    },
    open: async (source, options) => {
      this.onNavigate();
      await this.navigateService.frame.open(source, options);
    },
  };

  constructor(
    private readonly navigateService: NavigateServiceInterface,
    private readonly onNavigate: () => void,
  ) {}

  async back(): Promise<void> {
    this.onNavigate();
    await this.navigateService.back();
  }

  async hashParams(to: RouterHashObject, options?: RouterHashNavigateOptions): Promise<void> {
    this.onNavigate();
    await this.navigateService.hashParams(to, options);
  }

  async replace(to: string, options?: Omit<RouterNavigateOptions, 'replace'>): Promise<void> {
    this.onNavigate();
    await this.navigateService.replace(to, options);
  }

  async searchParams(to: RouterSearchObject, options?: RouterSearchNavigateOptions): Promise<void> {
    this.onNavigate();
    await this.navigateService.searchParams(to, options);
  }

  async to(to: string, options?: RouterNavigateOptions): Promise<void> {
    this.onNavigate();
    await this.navigateService.to(to, options);
  }
}

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

const createProviderContext = (
  scope: FrameScope,
  options: Required<FrameRuntimeLoadOptions>,
): RuntimeProviderPipelineContext => {
  return {
    params: options.location.params,
    props: {},
    scope,
    signal: options.signal,
  };
};
