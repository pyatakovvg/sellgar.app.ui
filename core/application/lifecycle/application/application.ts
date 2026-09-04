import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { NavigationBlockerRuntimeInterface } from '../../../features/navigation-blocker/runtime/navigation-blocker-runtime';
import type { NavigationBlockerBoundary } from '../../../features/navigation-blocker/runtime/navigation-blocker-runtime';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import type { PolicyBoundaryDecision } from '../../../policy/contract/policy-boundary-decision';
import type {
  RouterBridgeHistoryEntryInterface,
  RouterBridgeInterface,
  RouterBridgeLocationInterface,
  RouterBridgeNavigationSource,
  RouterBridgeRestoreContextInterface,
} from '../../../router/bridge/router-bridge';
import { resolveRouterBridgeLocation } from '../../../router/runtime/router-address-resolver';
import { NavigationHistory } from '../../../router/runtime/navigation-history';
import { areNavigationStatesEqual, type NavigationState } from '../../../router/runtime/navigation-state';
import {
  RouterRuntime,
  type RouterRuntimeActivation,
  type RouterRuntimeActivationPhase,
  type RouterRuntimeActivationTree,
} from '../../../router/runtime/router-runtime';
import { getRouterGraph } from '../../../router/runtime/router-graph';
import {
  createCoreNavigate,
  resolveCoreNavigation,
  resolveCoreRootNavigation,
} from '../../../router/service/navigate-service';
import type { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { RuntimeOperationCoordinator } from '../../../runtime/operation/runtime-operation-coordinator';
import {
  createRuntimeRevisionGuard,
  executeRuntimeOperation,
  executeRuntimeParticipant,
} from '../../../runtime/operation/runtime-operation';
import {
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailureSource,
} from '../../../runtime/failure/runtime-failure';
import { captureRuntimeFailure, throwRuntimeOperationError } from '../../../runtime/failure/runtime-failure-signal';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { ApplicationConfig } from '../../config/application-config';
import type {
  ApplicationConfiguratorInterface,
  ApplicationInitializerDeclaration,
} from '../../config/application-configurator';
import { DisposableRegistry } from '../../disposable/disposable-registry';
import { RequestExecutor } from '../../request/request-executor';
import {
  type ApplicationInitializerContextInterface,
  type ApplicationInitializerInterface,
  type ApplicationInitializerToken,
  isApplicationInitializerToken,
} from '../../initializer/application-initializer';
import { ApplicationInitializerGroup } from '../../initializer/application-initializer-group';
import {
  SessionRuntimeState,
  SessionRuntimeStateInterface,
  type SessionRuntimeStateChange,
} from '../../session/session-runtime-state';
import { ApplicationEventBusBindings } from '../../event/application-event-bus';
import { ApplicationStoreBindings } from '../../store/application-store';
import {
  ApplicationControllerInterface,
  type ApplicationLifecycleListener,
  type ApplicationLifecyclePhase,
  type ApplicationLifecycleSnapshot,
} from '../application-lifecycle';

interface AutoBindableApplicationScope {
  bindSelf<TValue>(token: DependencyConstructor<TValue>): void;

  has<TValue>(token: DependencyToken<TValue>): boolean;
}

export type ApplicationNavigationDecision = Extract<
  PolicyBoundaryDecision,
  { readonly type: 'forbidden' | 'not-found' }
>;

type ApplicationActionRedirectDecision = Extract<
  PolicyBoundaryDecision,
  { readonly type: 'redirect' | 'redirect-to-saved-location' }
>;

interface ApplicationSessionBoundary {
  readonly allowSaveCurrentLocation: boolean;
  readonly revision: number;
}

interface ApplicationNavigationHistoryCommit<TPresentation> {
  readonly history: RouterBridgeHistoryEntryInterface;
  readonly released: readonly RouterRuntimeActivation<TPresentation>[];
}

export interface ApplicationNavigationSnapshot {
  readonly decision: ApplicationNavigationDecision | null;
  readonly navigation: NavigationState | undefined;
  readonly pending: NavigationState | null;
}

export interface ApplicationRouterRuntimeEntry<TPresentation> {
  readonly activation: RouterRuntimeActivation<TPresentation>;
  readonly key: string;
  readonly phase: RouterRuntimeActivationPhase;
  readonly runtime: RouterRuntime<TPresentation>;
  readonly tree: RouterRuntimeActivationTree<TPresentation>;
}

export interface ApplicationRouterHistoryEntry<TPresentation> {
  readonly activation: RouterRuntimeActivation<TPresentation>;
  readonly key: string;
  readonly phase: Extract<RouterRuntimeActivationPhase, 'focused' | 'retained'>;
  readonly runtime: RouterRuntime<TPresentation>;
  readonly tree: RouterRuntimeActivationTree<TPresentation>;
}

export type ApplicationNavigationListener = () => void;

@UseBindings(ApplicationEventBusBindings, ApplicationStoreBindings)
export abstract class Application<
  TPresentation = unknown,
  TConfigurator extends ApplicationConfiguratorInterface = ApplicationConfiguratorInterface,
> extends ApplicationControllerInterface {
  private readonly applicationAbortController = new AbortController();
  private readonly disposables = new DisposableRegistry();
  private readonly listeners = new Set<ApplicationLifecycleListener>();
  private readonly navigationListeners = new Set<ApplicationNavigationListener>();
  private readonly navigationHistory = new NavigationHistory<RouterRuntimeActivation<TPresentation>>();
  private readonly scope = new ApplicationScope();
  private readonly session = new SessionRuntimeState();

  private initializerAbortController: AbortController | null = null;
  private initializePromise: Promise<void> | null = null;
  private detachRuntimeRefresh: (() => void) | null = null;
  private detachSessionState: (() => void) | null = null;
  private navigationAbortController: AbortController | null = null;
  private navigationPromise: Promise<boolean> | null = null;
  private navigateService: NavigateServiceInterface | null = null;
  private navigationSnapshot: ApplicationNavigationSnapshot = Object.freeze({
    decision: null,
    navigation: undefined,
    pending: null,
  });
  private routerRuntime: RouterRuntime<TPresentation> | null = null;
  private pendingSessionBoundary: ApplicationSessionBoundary | null = null;
  private savedNavigationState: NavigationState | undefined;
  private lifecycleSnapshot: ApplicationLifecycleSnapshot = {
    error: null,
    phase: 'created',
  };
  private state: ApplicationLifecyclePhase = 'created';

  protected constructor(
    private readonly routerBridge: RouterBridgeInterface,
    private readonly config: ApplicationConfig & TConfigurator,
    private readonly moduleExportResolver: ModuleExportResolverInterface<TPresentation>,
  ) {
    super();
  }

  get lifecycle(): ApplicationLifecycleSnapshot {
    return this.lifecycleSnapshot;
  }

  async failRender(error: unknown): Promise<void> {
    if (this.state === 'disposed' || this.state === 'disposing' || this.state === 'failed') {
      return;
    }

    const failure = captureRuntimeFailure(error, createApplicationRuntimeSource('render'));

    this.navigationAbortController?.abort(error);
    this.initializerAbortController?.abort(error);
    this.setPendingNavigation(null);
    this.fail(error);
    await this.routerRuntime?.dispose();
    await reportRuntimeFailure(
      this.scope.get(RuntimeFailureReporterInterface),
      failure,
      { kind: 'application' },
      'application.failed',
      'failed',
    );
  }

  compose(): void {
    if (this.state === 'composed' || this.state === 'ready') {
      return;
    }

    if (this.state === 'disposed' || this.state === 'disposing') {
      throw new Error('Приложение уже освобождено.');
    }

    this.setState('composing');

    try {
      this.scope.bindSession(this.session);
      this.detachSessionState = this.session.subscribe((change) => this.captureSessionBoundary(change));
      this.scope.bindDisposables(this.disposables);
      this.scope.activate(this);
      this.configure(this.config);
      getRouterGraph(this.config.routerValue);

      this.navigateService = createCoreNavigate({
        back: () => this.routerBridge.back(),
        close: async (navigation) => {
          await this.closeNavigation(navigation);
        },
        current: () => this.navigationSnapshot.navigation,
        execute: async (navigation) => {
          await this.executeNavigation(navigation);
        },
        router: this.config.routerValue,
      });
      this.scope.bindNavigate(this.navigateService);
      this.routerRuntime = new RouterRuntime(this.config.routerValue, this.scope, this.moduleExportResolver, {
        app: this,
        applyActionRedirect: (decision) => this.executeActionPolicyRedirect(decision),
        confirmNavigation: (leavingBoundaries, signal) => this.confirmNavigation(leavingBoundaries, signal),
        session: this.session,
      });
      this.detachRuntimeRefresh = this.scope
        .get(RuntimeOperationCoordinator)
        .attachRefresh(() => this.refreshRuntime());

      for (const feature of this.config.featuresValue) {
        this.scope.activate(feature);
      }
      this.setState('composed');
    } catch (error) {
      this.detachSessionState?.();
      this.detachSessionState = null;
      this.detachRuntimeRefresh?.();
      this.detachRuntimeRefresh = null;
      const failure = captureRuntimeFailure(error, createApplicationRuntimeSource('compose'));

      this.reportFailure(failure, 'application.activation-failed', 'failed');
      this.fail(failure.cause);
      throw failure.cause;
    }
  }

  async initialize(): Promise<void> {
    if (this.state === 'ready') {
      return;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    if (this.state === 'created') {
      throw new Error('Приложение нужно скомпоновать перед initialize.');
    }

    if (this.state === 'failed') {
      throw this.lifecycleSnapshot.error;
    }

    if (this.state === 'disposed' || this.state === 'disposing') {
      throw new Error('Приложение уже освобождено.');
    }

    this.initializerAbortController = new AbortController();
    this.initializePromise = this.runInitialization(this.initializerAbortController.signal).finally(() => {
      this.initializePromise = null;
    });

    return this.initializePromise;
  }

  async dispose(): Promise<void> {
    if (this.state === 'disposed' || this.state === 'disposing') {
      return;
    }

    this.setState('disposing');
    this.detachSessionState?.();
    this.detachSessionState = null;
    this.detachRuntimeRefresh?.();
    this.detachRuntimeRefresh = null;
    this.initializerAbortController?.abort();
    if (this.scope.has(SessionRuntimeStateInterface)) {
      this.scope.get(RequestExecutor).cancelAll();
    }
    this.applicationAbortController.abort(new Error('Приложение освобождено.'));
    this.navigationAbortController?.abort(new Error('Навигация остановлена при освобождении приложения.'));
    await Promise.allSettled(this.navigationPromise ? [this.navigationPromise] : []);

    await this.routerBridge.dispose();
    await this.routerRuntime?.dispose();
    await this.scope.disposeWidgetRuntimes();
    await this.scope.disposeProviders();
    if (this.scope.has(RuntimeOperationCoordinator)) {
      this.scope.get(RuntimeOperationCoordinator).dispose();
    }
    await this.disposables.dispose((error) => {
      const failure = captureRuntimeFailure(error, {
        operation: 'dispose',
        owner: { kind: 'application' },
        participant: { kind: 'disposable' },
      });

      this.reportFailure(failure, 'cleanup.contained', 'disposing');
    });
    this.scope.dispose();
    this.navigationListeners.clear();
    this.setState('disposed');
  }

  subscribe(listener: ApplicationLifecycleListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  protected abstract configure(app: TConfigurator): void;

  protected getNavigationSnapshot(): ApplicationNavigationSnapshot {
    return this.navigationSnapshot;
  }

  protected getRouterRuntimeEntries(): readonly ApplicationRouterRuntimeEntry<TPresentation>[] {
    const activations = new Set<RouterRuntimeActivation<TPresentation>>();
    const entries: ApplicationRouterRuntimeEntry<TPresentation>[] = [];

    for (const historyEntry of this.navigationHistory.snapshot()) {
      const activation = historyEntry.activation;

      if (activation === null || activations.has(activation)) continue;

      activations.add(activation);
      const tree = activation.getTreeSnapshot();

      entries.push(
        Object.freeze({
          activation,
          key: activation.id,
          phase: activation.getSnapshot().phase,
          runtime: tree.runtime,
          tree,
        }),
      );
    }

    return Object.freeze(entries);
  }

  protected getRouterHistoryEntries(): readonly ApplicationRouterHistoryEntry<TPresentation>[] {
    const history = this.navigationHistory.snapshot();
    const current = history.at(-1);

    return Object.freeze(
      history.flatMap((entry) => {
        if (entry.activation === null) return [];

        const tree = entry.activation.getTreeSnapshot();

        return [
          Object.freeze({
            activation: entry.activation,
            key: entry.id,
            phase: entry === current ? ('focused' as const) : ('retained' as const),
            runtime: tree.runtime,
            tree,
          }),
        ];
      }),
    );
  }

  protected getApplicationScope(): ApplicationScope {
    return this.scope;
  }

  protected subscribeNavigation(listener: ApplicationNavigationListener): () => void {
    this.navigationListeners.add(listener);

    return () => {
      this.navigationListeners.delete(listener);
    };
  }

  protected getRouterRuntime(): RouterRuntime<TPresentation> {
    if (!this.routerRuntime) {
      throw new Error('RouterRuntime недоступен до compose().');
    }

    return this.routerRuntime;
  }

  private async runInitialization(signal: AbortSignal): Promise<void> {
    this.setState('initializing');

    try {
      for (const declaration of this.config.initializersValue) {
        await this.executeInitializerDeclaration(declaration, signal);
      }

      if (signal.aborted) {
        return;
      }

      await this.routerBridge.initialize({
        back: () => this.backNavigation(),
        cancelNavigation: () => this.cancelPendingNavigation(),
        confirm: (location, confirmationSignal) => this.confirmBridgeLocation(location, confirmationSignal),
        navigate: this.requireNavigateService(),
        restore: (location, restoreContext) => this.restoreBridgeLocation(location, restoreContext),
        router: this.config.routerValue,
        shouldBlockUnload: () => this.shouldBlockUnload(),
        signal,
      });

      if (signal.aborted) {
        return;
      }

      this.setState('ready');
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      if (error instanceof ApplicationInitializerRejected) {
        this.fail(error.cause);
        throw error.cause;
      }

      const failure = captureRuntimeFailure(error, createApplicationRuntimeSource('initialize'));

      await reportRuntimeFailure(
        this.scope.get(RuntimeFailureReporterInterface),
        failure,
        { kind: 'application' },
        'application.activation-failed',
        'failed',
      );
      this.fail(failure.cause);
      throw failure.cause;
    }
  }

  private async executeInitializerDeclaration(
    declaration: ApplicationInitializerDeclaration,
    signal: AbortSignal,
  ): Promise<void> {
    if (declaration instanceof ApplicationInitializerGroup) {
      await Promise.all(
        declaration.initializers.map((initializer) => {
          return this.executeInitializer(initializer, signal);
        }),
      );
      return;
    }

    await this.executeInitializer(declaration, signal);
  }

  private async executeInitializer(initializerToken: ApplicationInitializerToken, signal: AbortSignal): Promise<void> {
    const initializer = this.resolveInitializer(initializerToken);
    const context: ApplicationInitializerContextInterface = {
      app: this,
      disposables: this.disposables,
      session: this.session,
      signal,
    };

    const result = await executeRuntimeOperation({
      guard: createRuntimeRevisionGuard(this.session),
      operation: () =>
        executeRuntimeParticipant(
          {
            operation: 'execute',
            owner: { kind: 'application' },
            participant: {
              kind: 'initializer',
              token: initializerToken,
            },
          },
          () => initializer.execute(context),
        ),
      signal,
      source: createApplicationRuntimeSource('initialize'),
    });

    switch (result.type) {
      case 'completed':
      case 'interrupted':
        return;
      case 'rejected':
        throw new ApplicationInitializerRejected(result.error);
      case 'failed':
        return throwRuntimeOperationError(result.failure.cause, result.failure.source);
      case 'escalated':
        return throwRuntimeOperationError(result.failure.cause, result.failure.source);
    }
  }

  private resolveInitializer(initializerToken: ApplicationInitializerToken): ApplicationInitializerInterface {
    if (isAutoBindableApplicationScope(this.scope) && !this.scope.has(initializerToken)) {
      this.assertInitializerToken(initializerToken);
      this.scope.bindSelf(initializerToken as DependencyConstructor<ApplicationInitializerInterface>);
    }

    return this.scope.get(initializerToken);
  }

  private restoreBridgeLocation(
    location: RouterBridgeLocationInterface,
    context: RouterBridgeRestoreContextInterface,
  ): Promise<boolean> {
    const entry = location.entryId ? this.navigationHistory.find(location.entryId) : null;
    const navigation = resolveRouterBridgeLocation(this.config.routerValue, location);

    return entry
      ? this.restoreHistoryEntry(entry.id, navigation, context.blockersConfirmed)
      : this.executeNavigation(navigation, 'external', context.blockersConfirmed);
  }

  private confirmBridgeLocation(location: RouterBridgeLocationInterface, signal: AbortSignal): Promise<boolean> {
    return this.getRouterRuntime().confirm(resolveRouterBridgeLocation(this.config.routerValue, location), {
      app: this,
      session: this.session,
      signal,
    });
  }

  private cancelPendingNavigation(): boolean {
    if (this.navigationSnapshot.pending === null || this.navigationAbortController === null) {
      return false;
    }

    this.navigationAbortController.abort(new Error('Навигация отменена Back operation.'));
    return true;
  }

  private async backNavigation(): Promise<boolean> {
    if (this.cancelPendingNavigation()) return true;

    const target = this.navigationHistory.previous();

    if (!target) return false;

    if (target.activation === null) {
      return this.executeNavigation(target.navigation, 'external', false, target.id);
    }

    const linkedSignal = createLinkedAbortController(this.applicationAbortController.signal);

    try {
      if (!(await this.getRouterRuntime().confirmActivation(target.activation, linkedSignal.controller.signal))) {
        return false;
      }

      await this.getRouterRuntime().focusActivation(
        target.activation,
        target.navigation,
        linkedSignal.controller.signal,
      );

      const mutation = this.navigationHistory.pop(target.id);

      if (!mutation) return false;

      this.setNavigationSnapshot(mutation.current.navigation, null);
      try {
        await this.routerBridge.commit(mutation.current.navigation, {
          history: this.createBridgeHistoryEntry('pop', mutation.current.id),
          signal: linkedSignal.controller.signal,
          source: 'external',
        });
      } finally {
        await this.releaseRouterActivations(mutation.released);
      }
      return true;
    } finally {
      linkedSignal.dispose();
    }
  }

  private async closeNavigation(navigation: NavigationState): Promise<void> {
    const previous = this.navigationHistory.previous();
    const ownerEntryId = previous && areNavigationStatesEqual(previous.navigation, navigation) ? previous.id : null;

    await this.executeNavigation(navigation, 'internal', false, ownerEntryId, ownerEntryId === null);
  }

  private async restoreHistoryEntry(
    entryId: string,
    navigation: NavigationState,
    blockersConfirmed: boolean,
  ): Promise<boolean> {
    const entry = this.navigationHistory.find(entryId);

    if (!entry) return false;
    if (this.navigationHistory.current?.id === entry.id) return true;

    if (entry.activation === null) {
      return this.executeNavigation(navigation, 'external', blockersConfirmed, entry.id);
    }

    const linkedSignal = createLinkedAbortController(this.applicationAbortController.signal);

    try {
      if (
        !blockersConfirmed &&
        !(await this.getRouterRuntime().confirmActivation(entry.activation, linkedSignal.controller.signal))
      ) {
        return false;
      }

      await this.getRouterRuntime().focusActivation(entry.activation, entry.navigation, linkedSignal.controller.signal);
      const mutation = this.navigationHistory.pop(entry.id);

      if (!mutation) return false;

      this.setNavigationSnapshot(mutation.current.navigation, null);
      try {
        await this.routerBridge.commit(mutation.current.navigation, {
          history: this.createBridgeHistoryEntry('pop', mutation.current.id),
          signal: linkedSignal.controller.signal,
          source: 'external',
        });
      } finally {
        await this.releaseRouterActivations(mutation.released);
      }
      return true;
    } finally {
      linkedSignal.dispose();
    }
  }

  private executeNavigation(
    navigation: NavigationState,
    source: RouterBridgeNavigationSource = 'internal',
    blockersConfirmed = false,
    historyTargetId: string | null = null,
    replaceCurrent = false,
    sessionBoundary: ApplicationSessionBoundary | null = null,
  ): Promise<boolean> {
    if (
      !blockersConfirmed &&
      this.scope.has(NavigationBlockerRuntimeInterface) &&
      this.scope.get(NavigationBlockerRuntimeInterface).hasAcceptedDecision()
    ) {
      return Promise.resolve(false);
    }

    const previous = this.navigationPromise;

    this.navigationAbortController?.abort(new Error('Навигация заменена новым переходом.'));

    const linkedSignal = createLinkedAbortController(this.applicationAbortController.signal);
    const abortController = linkedSignal.controller;

    this.navigationAbortController = abortController;
    this.setPendingNavigation(navigation);

    const promise = (async () => {
      await previous?.catch(() => undefined);

      if (abortController.signal.aborted) {
        return false;
      }

      return await this.runNavigation(
        navigation,
        abortController.signal,
        0,
        source,
        blockersConfirmed,
        historyTargetId,
        replaceCurrent,
        sessionBoundary,
      );
    })().finally(() => {
      if (this.scope.has(NavigationBlockerRuntimeInterface)) {
        this.scope.get(NavigationBlockerRuntimeInterface).complete();
      }

      linkedSignal.dispose();

      if (this.navigationAbortController === abortController) {
        this.navigationAbortController = null;
      }

      if (this.navigationPromise === promise) {
        this.navigationPromise = null;
        this.setPendingNavigation(null);
      }
    });

    this.navigationPromise = promise;

    return promise;
  }

  private confirmNavigation(
    leavingBoundaries: readonly NavigationBlockerBoundary[],
    signal: AbortSignal,
  ): Promise<boolean> {
    if (!this.scope.has(NavigationBlockerRuntimeInterface)) {
      return Promise.resolve(true);
    }

    return this.scope.get(NavigationBlockerRuntimeInterface).confirm(leavingBoundaries, signal);
  }

  private shouldBlockUnload(): boolean {
    return (
      this.scope.has(NavigationBlockerRuntimeInterface) &&
      this.scope.get(NavigationBlockerRuntimeInterface).shouldBlockUnload()
    );
  }

  private async runNavigation(
    navigation: NavigationState,
    signal: AbortSignal,
    redirectDepth: number,
    source: RouterBridgeNavigationSource,
    blockersConfirmed: boolean,
    historyTargetId: string | null,
    replaceCurrent: boolean,
    sessionBoundary: ApplicationSessionBoundary | null,
  ): Promise<boolean> {
    if (redirectDepth > MAX_POLICY_REDIRECT_DEPTH) {
      throw new Error('Policy navigation превысила допустимую глубину redirect.');
    }

    const prepareContext = {
      app: this,
      blockersConfirmed,
      session: this.session,
      signal,
    };
    const result = sessionBoundary
      ? await this.getRouterRuntime().restart(navigation, prepareContext)
      : await this.getRouterRuntime().prepare(navigation, prepareContext);

    if (result.type === 'interrupted') {
      return false;
    }

    this.setPendingNavigation(result.type === 'decision' ? result.navigation : result.transition.navigation);

    if (result.type === 'decision') {
      return await this.applyNavigationDecision(
        result.decision,
        result.navigation,
        signal,
        redirectDepth,
        source,
        blockersConfirmed,
        historyTargetId,
        replaceCurrent,
        sessionBoundary,
      );
    }

    const { transition } = result;
    let committed = false;

    try {
      const activation = await transition.commit();
      committed = true;
      const historyCommit = this.commitNavigationHistory(
        transition.navigation,
        activation,
        historyTargetId,
        replaceCurrent,
        sessionBoundary !== null,
      );

      try {
        let bridgeCommit: Promise<void> | void;

        try {
          if (signal.aborted) return false;

          bridgeCommit = this.routerBridge.commit(transition.navigation, {
            history: historyCommit.history,
            signal,
            source,
          });
        } finally {
          transition.publish();
        }

        await bridgeCommit;
      } finally {
        await this.releaseRouterActivations(historyCommit.released);
      }
      this.setNavigationSnapshot(
        transition.navigation,
        transition.navigation.boundary === null ? null : NOT_FOUND_DECISION,
      );
      await transition.complete({ signal });
      return true;
    } catch (error) {
      if (!committed) {
        await transition.discard().catch(() => undefined);
      }

      if (signal.aborted) {
        return false;
      }

      throw error;
    }
  }

  private commitNavigationHistory(
    navigation: NavigationState,
    activation: RouterRuntimeActivation<TPresentation>,
    historyTargetId: string | null = null,
    replaceCurrent = false,
    resetHistory = false,
  ): ApplicationNavigationHistoryCommit<TPresentation> {
    const current = this.navigationHistory.current;
    const action = resetHistory
      ? 'reset'
      : historyTargetId
        ? 'pop'
        : current === null
          ? 'replace'
          : replaceCurrent || navigation.replace
            ? 'replace'
            : current.activation === activation
              ? 'update'
              : 'push';
    const mutation = resetHistory
      ? this.navigationHistory.reset(navigation, activation)
      : historyTargetId
        ? this.navigationHistory.restore(historyTargetId, navigation, activation)
        : action === 'push'
          ? this.navigationHistory.push(navigation, activation)
          : action === 'reset'
            ? this.navigationHistory.reset(navigation, activation)
            : action === 'replace'
              ? this.navigationHistory.replace(navigation, activation)
              : this.navigationHistory.updateCurrent(navigation);

    if (!mutation) {
      throw new Error('Navigation history target отсутствует во время restore commit.');
    }

    const released = new Set(mutation.released);

    if (this.routerBridge.runtimeRetention === 'release') {
      for (const inactive of this.navigationHistory.releaseInactiveActivations()) {
        released.add(inactive);
      }
    }

    return Object.freeze({
      history: this.createBridgeHistoryEntry(action, mutation.current.id),
      released: Object.freeze([...released]),
    });
  }

  private async releaseRouterActivations(
    activations: readonly RouterRuntimeActivation<TPresentation>[],
  ): Promise<void> {
    await Promise.all(activations.map((activation) => this.getRouterRuntime().releaseActivation(activation)));
  }

  private createBridgeHistoryEntry(
    action: RouterBridgeHistoryEntryInterface['action'],
    id: string,
  ): RouterBridgeHistoryEntryInterface {
    const entries = this.navigationHistory.snapshot();
    const index = entries.findIndex((entry) => entry.id === id);

    if (index < 0) throw new Error('Navigation history entry отсутствует в core history.');

    return Object.freeze({ action, id, index, length: entries.length });
  }

  private async applyNavigationDecision(
    decision: PolicyBoundaryDecision,
    navigation: NavigationState,
    signal: AbortSignal,
    redirectDepth: number,
    source: RouterBridgeNavigationSource,
    blockersConfirmed: boolean,
    historyTargetId: string | null,
    replaceCurrent: boolean,
    sessionBoundary: ApplicationSessionBoundary | null,
  ): Promise<boolean> {
    switch (decision.type) {
      case 'continue':
        throw new Error('RouterRuntime не должен возвращать continue как terminal decision.');
      case 'error':
        throw decision.error;
      case 'redirect': {
        if (decision.saveCurrentLocation && (sessionBoundary?.allowSaveCurrentLocation ?? true)) {
          this.savedNavigationState = navigation;
        }

        const target = resolveCoreNavigation(
          this.config.routerValue,
          decision.to,
          {
            params: decision.params,
            replace: decision.replace,
          },
          this.navigationSnapshot.navigation,
        );

        this.setPendingNavigation(target);
        return await this.runNavigation(
          target,
          signal,
          redirectDepth + 1,
          source,
          blockersConfirmed,
          null,
          replaceCurrent,
          sessionBoundary,
        );
      }
      case 'redirect-to-saved-location': {
        const saved = this.savedNavigationState;

        this.savedNavigationState = undefined;

        const target = saved
          ? Object.freeze({ ...saved, replace: decision.replace })
          : resolveCoreRootNavigation(
              this.config.routerValue,
              { replace: decision.replace },
              this.navigationSnapshot.navigation,
            );

        this.setPendingNavigation(target);
        return await this.runNavigation(
          target,
          signal,
          redirectDepth + 1,
          source,
          blockersConfirmed,
          null,
          replaceCurrent,
          sessionBoundary,
        );
      }
      case 'forbidden':
      case 'not-found': {
        const activation = await this.getRouterRuntime().commitBoundary(
          navigation,
          decision.type,
          signal,
          sessionBoundary === null,
        );
        const historyCommit = this.commitNavigationHistory(
          navigation,
          activation,
          historyTargetId,
          replaceCurrent,
          sessionBoundary !== null,
        );

        try {
          await this.routerBridge.commit(navigation, {
            history: historyCommit.history,
            signal,
            source,
          });
        } finally {
          await this.releaseRouterActivations(historyCommit.released);
        }

        if (signal.aborted) {
          return false;
        }

        this.setNavigationSnapshot(navigation, decision);
        return true;
      }
    }
  }

  private async executeActionPolicyRedirect(decision: ApplicationActionRedirectDecision): Promise<void> {
    switch (decision.type) {
      case 'redirect': {
        if (decision.saveCurrentLocation) {
          this.savedNavigationState = this.navigationSnapshot.navigation;
        }

        const target = resolveCoreNavigation(
          this.config.routerValue,
          decision.to,
          {
            params: decision.params,
            replace: decision.replace,
          },
          this.navigationSnapshot.navigation,
        );

        await this.executeNavigation(target);
        return;
      }
      case 'redirect-to-saved-location': {
        const saved = this.savedNavigationState;

        this.savedNavigationState = undefined;

        const target = saved
          ? Object.freeze({ ...saved, replace: decision.replace })
          : resolveCoreRootNavigation(
              this.config.routerValue,
              { replace: decision.replace },
              this.navigationSnapshot.navigation,
            );

        await this.executeNavigation(target);
      }
    }
  }

  private captureSessionBoundary(change: SessionRuntimeStateChange): void {
    if (this.navigationSnapshot.navigation === undefined) {
      return;
    }

    const explicitSignOut =
      change.cause === 'state-change' && change.previousPhase === 'authenticated' && change.phase === 'anonymous';

    this.pendingSessionBoundary = Object.freeze({
      allowSaveCurrentLocation: (this.pendingSessionBoundary?.allowSaveCurrentLocation ?? true) && !explicitSignOut,
      revision: change.revision,
    });

    if (explicitSignOut) {
      this.savedNavigationState = undefined;
    }
  }

  private async refreshRuntime(): Promise<void> {
    await this.navigationPromise?.catch(() => undefined);

    if (this.state === 'disposed' || this.state === 'disposing') {
      return;
    }

    const navigation = this.navigationSnapshot.navigation;

    if (!navigation) {
      return;
    }

    const sessionBoundary = this.pendingSessionBoundary;

    if (sessionBoundary !== null) {
      this.pendingSessionBoundary = null;

      await this.executeNavigation(
        Object.freeze({
          ...navigation,
          initiator: null,
          replace: true,
          revalidation: null,
        }),
        'internal',
        false,
        null,
        false,
        sessionBoundary,
      );
      return;
    }

    if (this.navigationSnapshot.decision !== null) {
      await this.executeNavigation(
        Object.freeze({
          ...navigation,
          replace: true,
          revalidation: Object.freeze({ kind: 'branch' }),
        }),
      );
      return;
    }

    const linkedSignal = createLinkedAbortController(this.applicationAbortController.signal);

    try {
      const result = await this.getRouterRuntime().refresh({
        app: this,
        session: this.session,
        signal: linkedSignal.controller.signal,
      });

      if (linkedSignal.controller.signal.aborted) {
        return;
      }

      if (this.navigationSnapshot.navigation !== navigation) {
        return;
      }

      switch (result.type) {
        case 'refreshed':
          if (this.navigationSnapshot.decision !== null) {
            this.setNavigationSnapshot(navigation, null);
          }
          return;
        case 'retry-navigation':
          await this.executeNavigation(
            Object.freeze({
              ...navigation,
              replace: true,
              revalidation: Object.freeze({ kind: 'branch' }),
            }),
          );
          return;
        case 'decision':
          if (result.decision.type === 'error') {
            throw result.decision.error;
          }

          await this.executeActionPolicyRedirect(result.decision);
      }
    } finally {
      linkedSignal.dispose();
    }
  }

  private setNavigationSnapshot(navigation: NavigationState, decision: ApplicationNavigationDecision | null): void {
    this.scope.syncLocation(navigation);
    this.navigationSnapshot = Object.freeze({
      decision,
      navigation,
      pending: this.navigationSnapshot.pending,
    });

    this.notifyNavigationListeners();
  }

  private setPendingNavigation(pending: NavigationState | null): void {
    if (this.navigationSnapshot.pending === pending) {
      return;
    }

    this.navigationSnapshot = Object.freeze({
      ...this.navigationSnapshot,
      pending,
    });

    this.notifyNavigationListeners();
  }

  private notifyNavigationListeners(): void {
    for (const listener of this.navigationListeners) {
      listener();
    }
  }

  private assertInitializerToken(initializerToken: ApplicationInitializerToken): void {
    if (!isApplicationInitializerToken(initializerToken)) {
      throw new Error('Initializer class must be decorated with @Initializer().');
    }
  }

  private requireNavigateService(): NavigateServiceInterface {
    if (!this.navigateService) {
      throw new Error('Навигация приложения недоступна.');
    }

    return this.navigateService;
  }

  private fail(error: unknown): void {
    this.setLifecycle('failed', error);
  }

  private reportFailure(
    failure: ReturnType<typeof captureRuntimeFailure>,
    disposition: 'application.activation-failed' | 'cleanup.contained',
    ownerState: string,
  ): void {
    try {
      void reportRuntimeFailure(
        this.scope.get(RuntimeFailureReporterInterface),
        failure,
        { kind: 'application' },
        disposition,
        ownerState,
      );
    } catch (cause) {
      globalThis.console.error({
        cause,
        runtimeFailure: failure,
      });
    }
  }

  private setState(state: ApplicationLifecyclePhase): void {
    this.setLifecycle(state, null);
  }

  private setLifecycle(state: ApplicationLifecyclePhase, error: unknown): void {
    this.state = state;
    this.lifecycleSnapshot = {
      error,
      phase: state,
    };

    for (const listener of this.listeners) {
      listener();
    }
  }
}

const isAutoBindableApplicationScope = (
  scope: ApplicationScope,
): scope is ApplicationScope & AutoBindableApplicationScope => {
  return (
    'bindSelf' in scope && 'has' in scope && typeof scope.bindSelf === 'function' && typeof scope.has === 'function'
  );
};

const createApplicationRuntimeSource = (operation: string): RuntimeFailureSource => {
  return {
    operation,
    owner: { kind: 'application' },
    participant: { kind: 'runtime' },
  };
};

class ApplicationInitializerRejected extends Error {
  constructor(readonly cause: unknown) {
    super('Application initializer was rejected by an expected operation result.', { cause });
  }
}

const createLinkedAbortController = (signal: AbortSignal) => {
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal.reason);

  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener('abort', abort, { once: true });
  }

  return {
    controller,
    dispose: () => signal.removeEventListener('abort', abort),
  };
};

const MAX_POLICY_REDIRECT_DEPTH = 32;
const NOT_FOUND_DECISION = Object.freeze({ type: 'not-found' as const });
