import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { NavigationBlockerBoundary } from '../../../features/navigation-blocker/runtime/navigation-blocker-runtime';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import type { PolicyBoundaryDecision } from '../../../policy/contract/policy-boundary-decision';
import { PolicyRunner } from '../../../policy/runtime/policy-runner';
import {
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeOwner,
} from '../../../runtime/failure/runtime-failure';
import { captureRuntimeFailure } from '../../../runtime/failure/runtime-failure-signal';
import { RuntimeOperationCoordinator } from '../../../runtime/operation/runtime-operation-coordinator';
import { ProviderPipeline } from '../../../runtime/provider/provider-pipeline';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { RouterScope } from '../../../runtime/scope/kind/router-scope';
import type { RouteDeclaration } from '../../declaration/route';
import { getRouterDefinition, type RouterDeclaration } from '../../declaration/router';
import { createScopedNavigate, NavigateServiceInterface } from '../../service/navigate-service';
import {
  ApplicationRouteQueryService,
  RouteQueryServiceInterface,
  ScopedRouteQueryService,
} from '../../service/route-query-service';
import {
  areNavigationParamsEqual,
  areNavigationQueriesEqual,
  matchesNavigationState,
  type NavigationRouterState,
  type NavigationState,
} from '../navigation-state';
import { getRouterGraph } from '../router-graph';
import {
  RouteActivationRuntime,
  RouteRuntime,
  type RouteRuntimeActionExecution,
  type RouteRuntimeBoundaryPhase,
} from '../route-runtime';
import type { RouteRuntimeContextInterface } from '../route-runtime-context';
import {
  resolveNavigationCandidates,
  type ResolvedNavigationCandidate,
  type ResolvedRouteEntry,
  type ResolvedRouterTarget,
} from './router-navigation.resolver.ts';
import { PreparedRouterTransition, type RouterRuntimePreparedTransition } from './router-transition.ts';

export type RouterRuntimePhase =
  'active' | 'disposed' | 'disposing' | 'failed' | 'forbidden' | 'idle' | 'not-found' | 'pending' | 'preparing';

type RouterRuntimeBoundaryPhase = Extract<RouterRuntimePhase, 'failed' | 'forbidden' | 'not-found'>;

export interface RouterRuntimeSnapshot {
  readonly error: unknown | null;
  readonly phase: RouterRuntimePhase;
}

export type RouterRuntimeActivationPhase = 'focused' | 'released' | 'retained';

export interface RouterRuntimeActivationSnapshot {
  readonly id: string;
  readonly phase: RouterRuntimeActivationPhase;
}

export interface RouterRuntimePrepareContext {
  readonly app: ApplicationControllerInterface;
  readonly blockersConfirmed?: boolean;
  readonly session: SessionRuntimeStateInterface;
  readonly signal: AbortSignal;
}

type ActionPolicyRedirectDecision = Extract<
  PolicyBoundaryDecision,
  { readonly type: 'redirect' | 'redirect-to-saved-location' }
>;

export interface RouterRuntimeExecutionContext {
  readonly app: ApplicationControllerInterface;
  readonly applyActionRedirect: (decision: ActionPolicyRedirectDecision) => Promise<void>;
  readonly confirmNavigation?: (
    leavingBoundaries: readonly NavigationBlockerBoundary[],
    signal: AbortSignal,
  ) => Promise<boolean>;
  readonly session: SessionRuntimeStateInterface;
}

export type RouterRuntimePrepareResult<TPresentation = unknown> =
  | {
      readonly decision: PolicyBoundaryDecision;
      readonly navigation: NavigationState;
      readonly type: 'decision';
    }
  | {
      readonly reason: unknown;
      readonly type: 'interrupted';
    }
  | {
      readonly transition: RouterRuntimePreparedTransition<TPresentation>;
      readonly type: 'ready';
    };

export type RouterRuntimeRefreshResult =
  | {
      readonly decision: Extract<
        PolicyBoundaryDecision,
        { readonly type: 'error' | 'redirect' | 'redirect-to-saved-location' }
      >;
      readonly type: 'decision';
    }
  | { readonly type: 'refreshed' }
  | { readonly type: 'retry-navigation' };

type RouterRuntimeListener = () => void;

interface RouterRuntimeEnvironment<TPresentation> {
  activationSequence: number;
  readonly execution: RouterRuntimeExecutionContext;
  readonly exportResolver: ModuleExportResolverInterface<TPresentation>;
  readonly rootRouter: RouterDeclaration;
  readonly routeIndexes: ReadonlyMap<RouteDeclaration, number>;
  readonly routerIndexes: ReadonlyMap<RouterDeclaration, number>;
  readonly routerReferences: Map<RouterRuntime<TPresentation>, number>;
  rootRuntime: RouterRuntime<TPresentation> | null;
}

interface RouterRuntimeActivationNode<TPresentation> {
  readonly boundary: Pick<RouterRuntimeSnapshot, 'error' | 'phase'> | null;
  readonly branch: RouterRuntimeBranch<TPresentation> | null;
  readonly child: RouterRuntimeActivationNode<TPresentation> | null;
  readonly navigation: NavigationState | undefined;
  readonly runtime: RouterRuntime<TPresentation>;
}

export interface RouterRuntimeActivationChild<TPresentation> {
  readonly owner: RouteActivationRuntime<TPresentation>;
  readonly tree: RouterRuntimeActivationTree<TPresentation>;
}

export interface RouterRuntimeActivationTree<TPresentation> {
  readonly child: RouterRuntimeActivationChild<TPresentation> | null;
  readonly routes: readonly RouteActivationRuntime<TPresentation>[];
  readonly runtime: RouterRuntime<TPresentation>;
  readonly snapshot: RouterRuntimeSnapshot;
}

export class RouterRuntimeActivation<TPresentation = unknown> {
  private navigationState: NavigationState;
  private snapshot: RouterRuntimeActivationSnapshot;

  constructor(
    navigation: NavigationState,
    private readonly root: RouterRuntimeActivationNode<TPresentation>,
    id: string,
  ) {
    this.navigationState = navigation;
    this.snapshot = Object.freeze({ id, phase: 'focused' });
  }

  get navigation(): NavigationState {
    return this.navigationState;
  }

  get id(): string {
    return this.snapshot.id;
  }

  getSnapshot(): RouterRuntimeActivationSnapshot {
    return this.snapshot;
  }

  getRouteRuntimes(): readonly RouteActivationRuntime<TPresentation>[] {
    return Object.freeze(collectActivationRouteRuntimes(this.root));
  }

  getTreeSnapshot(): RouterRuntimeActivationTree<TPresentation> {
    return createActivationTreeSnapshot(this.root);
  }

  updateNavigation(navigation: NavigationState): void {
    this.navigationState = navigation;
  }

  /** @internal */
  getRootNode(): RouterRuntimeActivationNode<TPresentation> {
    return this.root;
  }

  markFocused(): void {
    this.setPhase('focused');
  }

  markReleased(): void {
    this.setPhase('released');
  }

  markRetained(): void {
    this.setPhase('retained');
  }

  private setPhase(phase: RouterRuntimeActivationPhase): void {
    if (this.snapshot.phase === 'released') {
      throw new Error('Освобождённую Router activation нельзя использовать повторно.');
    }

    if (this.snapshot.phase !== phase) {
      this.snapshot = Object.freeze({ id: this.snapshot.id, phase });
    }
  }
}

interface RuntimeRouteEntry<TPresentation> {
  readonly ownerRuntime: RouteRuntime<TPresentation>;
  readonly resolved: ResolvedRouteEntry;
  readonly runtime: RouteActivationRuntime<TPresentation>;
}

export interface ActiveChildRouterRuntime<TPresentation> {
  readonly owner: RouteActivationRuntime<TPresentation>;
  readonly runtime: RouterRuntime<TPresentation>;
}

export interface RouterRuntimeBranchSnapshot<TPresentation> {
  readonly child: ActiveChildRouterRuntime<TPresentation> | null;
  readonly childPending: boolean;
  readonly pending: boolean;
  readonly pendingLocalChange: {
    readonly commonRouteCount: number;
  } | null;
  readonly routes: readonly RouteActivationRuntime<TPresentation>[];
}

interface RouterRuntimeBranch<TPresentation> {
  readonly child: ActiveChildRouterRuntime<TPresentation> | null;
  readonly routes: readonly RuntimeRouteEntry<TPresentation>[];
}

interface RouterTransitionPlan<TPresentation> {
  readonly childPlan: RouterTransitionPlan<TPresentation> | null;
  readonly commonRouteCount: number;
  readonly createdChild: boolean;
  readonly createdRoutes: readonly RuntimeRouteEntry<TPresentation>[];
  readonly localChanged: boolean;
  readonly nextChild: RouterRuntime<TPresentation> | null;
  readonly nextChildOwner: RouteActivationRuntime<TPresentation> | null;
  readonly nextRoutes: readonly RuntimeRouteEntry<TPresentation>[];
  readonly previousBranch: RouterRuntimeBranch<TPresentation> | null;
  readonly query: Readonly<Record<string, unknown>>;
  readonly runtime: RouterRuntime<TPresentation>;
}

interface RouterBoundaryTransition<TPresentation> {
  readonly error: unknown | null;
  readonly kind: 'router';
  readonly phase: RouterRuntimeBoundaryPhase;
  readonly plan: RouterTransitionPlan<TPresentation>;
}

interface RouteBoundaryTransition<TPresentation> {
  readonly entry: RuntimeRouteEntry<TPresentation>;
  readonly error: unknown | null;
  readonly kind: 'route';
  readonly origin: 'policy' | 'runtime';
  readonly phase: RouteRuntimeBoundaryPhase;
  readonly plan: RouterTransitionPlan<TPresentation>;
}

type RuntimeBoundaryTransition<TPresentation> =
  RouteBoundaryTransition<TPresentation> | RouterBoundaryTransition<TPresentation>;

interface RouterPlanPreparation<TPresentation> {
  readonly plan: RouterTransitionPlan<TPresentation>;
  readonly routes: readonly RuntimeRouteEntry<TPresentation>[];
}

interface RouterPlanPolicyResult<TPresentation> {
  readonly decision: PolicyBoundaryDecision;
  readonly owner:
    { readonly kind: 'route'; readonly entry: RuntimeRouteEntry<TPresentation> } | { readonly kind: 'router' };
  readonly plan: RouterTransitionPlan<TPresentation>;
}

type ActivePolicyBoundary<TPresentation> =
  | {
      readonly kind: 'route';
      readonly entry: RuntimeRouteEntry<TPresentation>;
    }
  | {
      readonly kind: 'router';
      readonly runtime: RouterRuntime<TPresentation>;
    };

interface PendingRouterTransition<TPresentation> {
  readonly allowActivationReuse: boolean;
  readonly abortController: AbortController;
  readonly boundary: RuntimeBoundaryTransition<TPresentation> | null;
  readonly disposeLinkedSignal: () => void;
  readonly navigation: NavigationState;
  readonly plan: RouterTransitionPlan<TPresentation>;
  readonly revision: number;
  readonly transition: PreparedRouterTransition<TPresentation>;
}

export class RouterRuntime<TPresentation = unknown> {
  private readonly definition;
  private readonly environment: RouterRuntimeEnvironment<TPresentation>;
  private readonly lifecycleAbortController = new AbortController();
  private readonly listeners = new Set<RouterRuntimeListener>();
  private readonly owner: RuntimeOwner;
  private readonly policyRunner: PolicyRunner<RouteRuntimeContextInterface>;
  private readonly preparationTasks = new Set<Promise<RouterRuntimePrepareResult<TPresentation>>>();
  private readonly routeRuntimes = new Map<RuntimeScope, Map<RouteDeclaration, RouteRuntime<TPresentation>>>();
  private readonly activations = new Set<RouterRuntimeActivation<TPresentation>>();
  private readonly routerScope: RouterScope;
  private readonly queryService: ScopedRouteQueryService | null;

  private committedBoundary: Pick<RouterRuntimeSnapshot, 'error' | 'phase'> | null = null;
  private committedBranch: RouterRuntimeBranch<TPresentation> | null = null;
  private committedNavigation: NavigationState | undefined;
  private disposePromise: Promise<void> | null = null;
  private focusedActivation: RouterRuntimeActivation<TPresentation> | null = null;
  private pendingBranchPlan: RouterTransitionPlan<TPresentation> | null = null;
  private pendingNavigation: NavigationState | null = null;
  private pendingNavigationRevision = 0;
  private pendingTransition: PendingRouterTransition<TPresentation> | null = null;
  private prepareAbortController: AbortController | null = null;
  private prepareRevision = 0;
  private providerPipeline: ProviderPipeline | null = null;
  private refreshAbortController: AbortController | null = null;
  private refreshBoundary: Pick<RouterRuntimeSnapshot, 'error' | 'phase'> | null = null;
  private refreshPromise: Promise<RouterRuntimeRefreshResult> | null = null;
  private snapshot: RouterRuntimeSnapshot = { error: null, phase: 'idle' };

  constructor(
    readonly router: RouterDeclaration,
    ownerScope: RuntimeScope,
    exportResolver: ModuleExportResolverInterface<TPresentation>,
    execution: RouterRuntimeExecutionContext,
    runtimeId = 'router:0',
    environment?: RouterRuntimeEnvironment<TPresentation>,
  ) {
    assertRuntimeId(runtimeId);

    this.definition = getRouterDefinition(router);
    this.environment = environment ?? createEnvironment(router, exportResolver, execution);

    if (this.environment.rootRuntime === null) {
      this.environment.rootRuntime = this;
    }
    this.owner = { id: runtimeId, kind: 'router' };
    const navigate = ownerScope.has(NavigateServiceInterface)
      ? createScopedNavigate(ownerScope.get(NavigateServiceInterface), router)
      : null;
    this.queryService = ownerScope.has(ApplicationRouteQueryService)
      ? new ScopedRouteQueryService(ownerScope.get(ApplicationRouteQueryService), router, navigate)
      : null;
    this.routerScope = new RouterScope(ownerScope, (registry) => {
      if (this.queryService) {
        registry.bind(RouteQueryServiceInterface).toConstantValue(this.queryService);
      }
      if (!navigate) {
        return;
      }

      registry.bind(NavigateServiceInterface).toConstantValue(navigate);
    });

    try {
      for (const bindingOwner of this.definition.bindingOwners) {
        this.routerScope.activate(bindingOwner);
      }

      this.policyRunner = new PolicyRunner(this.routerScope, this.owner);
    } catch (error) {
      this.routerScope.dispose();
      throw error;
    }
  }

  getSnapshot(): RouterRuntimeSnapshot {
    return this.refreshBoundary ?? this.snapshot;
  }

  getRouterScope(): RuntimeScope {
    return this.routerScope;
  }

  getCommittedNavigation(): NavigationState | undefined {
    return this.committedNavigation;
  }

  getPendingNavigation(): NavigationState | null {
    return this.pendingNavigation;
  }

  getFocusedActivation(): RouterRuntimeActivation<TPresentation> | null {
    return this.focusedActivation;
  }

  findActivation(navigation: NavigationState): RouterRuntimeActivation<TPresentation> | null {
    return (
      [...this.activations].find(
        (activation) =>
          activation.getSnapshot().phase !== 'released' &&
          areActivationNavigationsEqual(activation.navigation, navigation),
      ) ?? null
    );
  }

  async focusActivation(
    activation: RouterRuntimeActivation<TPresentation>,
    navigation: NavigationState,
    signal: AbortSignal,
  ): Promise<void> {
    this.assertActive();

    if (!this.activations.has(activation)) {
      throw new Error('Router activation не принадлежит этому RouterRuntime.');
    }

    const previous = this.focusedActivation;

    if (previous === activation) {
      activation.updateNavigation(navigation);
      this.restoreActivationNode(activation.getRootNode(), navigation);
      return;
    }

    await this.switchRouteFocus(previous?.getRootNode() ?? null, activation.getRootNode(), signal);
    this.restoreActivationNode(activation.getRootNode(), navigation);
    previous?.markRetained();
    activation.updateNavigation(navigation);
    activation.markFocused();
    this.focusedActivation = activation;
    this.emit();
  }

  confirmActivation(activation: RouterRuntimeActivation<TPresentation>, signal: AbortSignal): Promise<boolean> {
    if (!this.activations.has(activation)) {
      throw new Error('Router activation не принадлежит этому RouterRuntime.');
    }

    const confirm = this.environment.execution.confirmNavigation;

    if (!confirm) return Promise.resolve(true);

    const leavingBoundaries = collectActivationNavigationBlockerBoundaries(
      this.focusedActivation?.getRootNode() ?? null,
      activation.getRootNode(),
    );

    return leavingBoundaries.length === 0 ? Promise.resolve(true) : confirm(Object.freeze(leavingBoundaries), signal);
  }

  async releaseActivation(activation: RouterRuntimeActivation<TPresentation>): Promise<void> {
    if (!this.activations.delete(activation)) return;

    if (this.focusedActivation === activation) {
      this.focusedActivation = null;
    }

    activation.markReleased();
    await this.releaseActivationNode(activation.getRootNode());
  }

  getActiveRouteRuntimes(): readonly RouteActivationRuntime<TPresentation>[] {
    return Object.freeze(collectBranchRouteRuntimes(this.committedBranch));
  }

  getActiveLocalRouteRuntimes(): readonly RouteActivationRuntime<TPresentation>[] {
    return Object.freeze(this.committedBranch?.routes.map((entry) => entry.runtime) ?? []);
  }

  getActiveChildRouterRuntimeOrNull(): ActiveChildRouterRuntime<TPresentation> | null {
    return this.committedBranch?.child ?? null;
  }

  getBranchSnapshot(): RouterRuntimeBranchSnapshot<TPresentation> {
    const pendingPlan = this.pendingBranchPlan;
    const committedBranch = this.committedBranch;
    const routes = Object.freeze(committedBranch?.routes.map((entry) => entry.runtime) ?? []);

    if (!pendingPlan) {
      return Object.freeze({
        child: committedBranch?.child ?? null,
        childPending: false,
        pending: false,
        pendingLocalChange: null,
        routes,
      });
    }

    if (pendingPlan.localChanged) {
      return Object.freeze({
        child: null,
        childPending: false,
        pending: true,
        pendingLocalChange: Object.freeze({ commonRouteCount: pendingPlan.commonRouteCount }),
        routes,
      });
    }

    const committedChild = committedBranch?.child ?? null;
    const pendingChild =
      pendingPlan.nextChild && pendingPlan.nextChildOwner
        ? Object.freeze({ owner: pendingPlan.nextChildOwner, runtime: pendingPlan.nextChild })
        : null;

    return Object.freeze({
      child: committedChild ?? pendingChild,
      childPending:
        pendingChild !== null && (committedChild === null || committedChild.runtime !== pendingChild.runtime),
      pending: true,
      pendingLocalChange: null,
      routes,
    });
  }

  async commitBoundary(
    navigation: NavigationState,
    phase: Extract<RouterRuntimeBoundaryPhase, 'forbidden' | 'not-found'>,
    signal: AbortSignal,
    allowActivationReuse = true,
  ): Promise<RouterRuntimeActivation<TPresentation>> {
    this.assertActive();
    this.committedBranch = null;
    this.committedBoundary = { error: null, phase };
    this.committedNavigation = navigation;
    this.setSnapshot(this.committedBoundary);

    return await this.captureCommittedActivation(navigation, signal, allowActivationReuse);
  }

  getPendingRouteRuntimes(): readonly RouteActivationRuntime<TPresentation>[] {
    return Object.freeze(this.pendingBranchPlan ? collectPlanRouteRuntimes(this.pendingBranchPlan) : []);
  }

  async failRender(error: unknown): Promise<void> {
    if (this.snapshot.phase === 'disposed' || this.snapshot.phase === 'disposing') {
      return;
    }

    this.prepareRevision += 1;
    this.prepareAbortController?.abort(error);
    await this.pendingTransition?.transition.discard().catch(() => undefined);

    const branch = this.committedBranch;

    this.committedBranch = null;
    this.committedBoundary = { error, phase: 'failed' };
    this.setSnapshot(this.committedBoundary);
    await this.disposeBranch(branch);
    await this.reportRenderFailure(error);
  }

  private async trimCommittedRouteBranch(
    runtime: RouteActivationRuntime<TPresentation>,
    reason: unknown,
  ): Promise<void> {
    if (this.snapshot.phase === 'disposed' || this.snapshot.phase === 'disposing') {
      return;
    }

    const branch = this.committedBranch;
    const boundaryIndex = branch?.routes.findIndex((entry) => entry.runtime === runtime) ?? -1;

    if (!branch || boundaryIndex < 0) {
      return;
    }

    this.prepareRevision += 1;
    this.prepareAbortController?.abort(reason);
    await this.pendingTransition?.transition.discard().catch(() => undefined);

    const childOwnerIndex = branch.child
      ? branch.routes.findIndex((entry) => entry.runtime === branch.child!.owner)
      : -1;
    const child = childOwnerIndex >= 0 && childOwnerIndex < boundaryIndex ? branch.child : null;
    const discardedChild = child === null ? branch.child : null;
    const discardedRoutes = branch.routes.slice(boundaryIndex + 1).reverse();

    this.committedBranch = {
      child,
      routes: Object.freeze(branch.routes.slice(0, boundaryIndex + 1)),
    };
    this.emit();

    await discardedChild?.runtime.dispose();

    for (const entry of discardedRoutes) {
      await this.disposeRouteEntry(entry, 'route.render-failure.dispose');
    }
  }

  private executeRouteAction(execution: RouteRuntimeActionExecution<TPresentation>): Promise<unknown> {
    const rootRuntime = this.environment.rootRuntime;

    if (rootRuntime === null) {
      return Promise.reject(new Error('Root RouterRuntime недоступен для controller action.'));
    }

    if (rootRuntime !== this) {
      return rootRuntime.executeRouteAction(execution);
    }

    return this.routerScope.get(RuntimeOperationCoordinator).run(() => this.runRouteAction(execution));
  }

  private async runRouteAction(execution: RouteRuntimeActionExecution<TPresentation>): Promise<unknown> {
    if (execution.signal.aborted) {
      return undefined;
    }

    const boundaries: ActivePolicyBoundary<TPresentation>[] = [];

    if (!this.collectActionPolicyPath(execution.runtime, boundaries)) {
      throw new Error('Controller action принадлежит неактивному RouteRuntime.');
    }

    const context: RouterRuntimePrepareContext = {
      app: this.environment.execution.app,
      session: this.environment.execution.session,
      signal: execution.signal,
    };

    for (const boundary of boundaries) {
      const decision =
        boundary.kind === 'router'
          ? await boundary.runtime.policyRunner.execute(
              boundary.runtime.definition.canMatch,
              createPolicyContext(EMPTY_PARAMS, context, execution.signal),
            )
          : await boundary.entry.runtime.executePolicyBoundary(
              'canMatch',
              createPolicyContext(boundary.entry.runtime.getParams(), context, execution.signal),
            );

      if (decision.type !== 'continue') {
        await this.applyActionPolicyDecision(boundary, decision);
        return undefined;
      }
    }

    for (const boundary of boundaries) {
      if (boundary.kind === 'router') {
        continue;
      }

      const decision = await boundary.entry.runtime.executePolicyBoundary(
        'canAction',
        createPolicyContext(boundary.entry.runtime.getParams(), context, execution.signal),
      );

      if (decision.type !== 'continue') {
        await this.applyActionPolicyDecision(boundary, decision);
        return undefined;
      }
    }

    if (execution.signal.aborted) {
      return undefined;
    }

    return await execution.execute();
  }

  private collectActionPolicyPath(
    target: RouteActivationRuntime<TPresentation>,
    boundaries: ActivePolicyBoundary<TPresentation>[],
  ): boolean {
    const initialLength = boundaries.length;
    const branch = this.committedBranch;

    boundaries.push({ kind: 'router', runtime: this });

    for (const entry of branch?.routes ?? []) {
      boundaries.push({ entry, kind: 'route' });

      if (entry.runtime === target) {
        return true;
      }

      if (branch?.child?.owner === entry.runtime) {
        if (branch.child.runtime.collectActionPolicyPath(target, boundaries)) {
          return true;
        }
      }
    }

    boundaries.splice(initialLength);

    return false;
  }

  private async applyActionPolicyDecision(
    boundary: ActivePolicyBoundary<TPresentation>,
    decision: Exclude<PolicyBoundaryDecision, { readonly type: 'continue' }>,
  ): Promise<void> {
    if (decision.type === 'redirect' || decision.type === 'redirect-to-saved-location') {
      await this.environment.execution.applyActionRedirect(decision);
      return;
    }

    if (decision.type === 'error') {
      if (boundary.kind === 'router') {
        await boundary.runtime.reportActionFailure(decision.error);
      } else {
        await boundary.entry.runtime.reportActionFailure(decision.error);
      }

      throw decision.error;
    }

    throw new ActionPolicyDecisionError(decision);
  }

  refresh(context: RouterRuntimePrepareContext): Promise<RouterRuntimeRefreshResult> {
    const rootRuntime = this.environment.rootRuntime;

    if (rootRuntime !== null && rootRuntime !== this) {
      return rootRuntime.refresh(context);
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const promise = this.runRefresh(context).finally(() => {
      if (this.refreshPromise === promise) {
        this.refreshPromise = null;
      }
    });

    this.refreshPromise = promise;

    return promise;
  }

  private async runRefresh(context: RouterRuntimePrepareContext): Promise<RouterRuntimeRefreshResult> {
    this.assertActive();

    if (!this.isRefreshableBranch()) {
      return { type: 'retry-navigation' };
    }

    const linkedSignal = createLinkedAbortController(context.signal);
    const abortController = linkedSignal.controller;
    const sessionRevision = context.session.revision;
    const unsubscribeSession = context.session.subscribe(() => {
      if (context.session.revision !== sessionRevision) {
        abortController.abort(new Error('Runtime refresh прерван изменением session.'));
      }
    });

    this.refreshAbortController = abortController;

    try {
      const boundaries: ActivePolicyBoundary<TPresentation>[] = [];

      this.collectActivePolicyPath(boundaries);

      const policyResult = await this.executeRefreshPolicies(boundaries, context, abortController.signal);

      if (policyResult !== null) {
        if (policyResult.decision.type === 'redirect' || policyResult.decision.type === 'redirect-to-saved-location') {
          return { decision: policyResult.decision, type: 'decision' };
        }

        this.applyRefreshBoundary(policyResult.boundary, policyResult.decision);

        if (policyResult.decision.type === 'error') {
          if (policyResult.boundary.kind === 'router') {
            await policyResult.boundary.runtime.reportRefreshFailure(policyResult.decision.error);
          } else {
            await policyResult.boundary.entry.runtime.reportBoundaryFailure(policyResult.decision.error);
          }

          return { decision: policyResult.decision, type: 'decision' };
        }

        return { type: 'refreshed' };
      }

      this.clearRefreshBoundaries();

      const routerRuntimes = boundaries.flatMap((boundary) => (boundary.kind === 'router' ? [boundary.runtime] : []));
      const routeRuntimes = boundaries.flatMap((boundary) =>
        boundary.kind === 'route' ? [boundary.entry.runtime] : [],
      );

      await Promise.all([
        ...routerRuntimes.map((runtime) => runtime.runProviderRevalidation(abortController.signal)),
        ...routeRuntimes.map((runtime) => runtime.revalidate({ signal: abortController.signal })),
      ]);
      throwIfAborted(abortController.signal);

      return { type: 'refreshed' };
    } catch (error) {
      if (abortController.signal.aborted) {
        return { type: 'refreshed' };
      }

      throw error;
    } finally {
      unsubscribeSession();
      linkedSignal.dispose();

      if (this.refreshAbortController === abortController) {
        this.refreshAbortController = null;
      }
    }
  }

  private collectActivePolicyPath(boundaries: ActivePolicyBoundary<TPresentation>[]): void {
    boundaries.push({ kind: 'router', runtime: this });

    for (const entry of this.committedBranch?.routes ?? []) {
      boundaries.push({ entry, kind: 'route' });
    }

    this.committedBranch?.child?.runtime.collectActivePolicyPath(boundaries);
  }

  private async executeRefreshPolicies(
    boundaries: readonly ActivePolicyBoundary<TPresentation>[],
    context: RouterRuntimePrepareContext,
    signal: AbortSignal,
  ): Promise<{
    readonly boundary: ActivePolicyBoundary<TPresentation>;
    readonly decision: Exclude<PolicyBoundaryDecision, { readonly type: 'continue' }>;
  } | null> {
    for (const policyBoundary of ['canMatch', 'canActivate'] as const) {
      for (const boundary of boundaries) {
        throwIfAborted(signal);

        const decision =
          boundary.kind === 'router'
            ? await boundary.runtime.policyRunner.execute(
                boundary.runtime.definition[policyBoundary],
                createPolicyContext(EMPTY_PARAMS, context, signal),
              )
            : await boundary.entry.runtime.executePolicyBoundary(
                policyBoundary,
                createPolicyContext(boundary.entry.runtime.getParams(), context, signal),
              );

        throwIfAborted(signal);

        if (decision.type !== 'continue') {
          return { boundary, decision };
        }
      }
    }

    return null;
  }

  private applyRefreshBoundary(
    boundary: ActivePolicyBoundary<TPresentation>,
    decision: Extract<PolicyBoundaryDecision, { readonly type: 'error' | 'forbidden' | 'not-found' }>,
  ): void {
    this.clearRefreshBoundaries();

    const phase = decision.type === 'error' ? 'failed' : decision.type;
    const error = decision.type === 'error' ? decision.error : null;

    if (boundary.kind === 'router') {
      boundary.runtime.refreshBoundary = { error, phase };
      boundary.runtime.emit();
      return;
    }

    boundary.entry.runtime.setRefreshBoundary(phase, error);
  }

  private clearRefreshBoundaries(): void {
    if (this.refreshBoundary !== null) {
      this.refreshBoundary = null;
      this.emit();
    }

    for (const entry of this.committedBranch?.routes ?? []) {
      entry.runtime.clearRefreshBoundary();
    }

    this.committedBranch?.child?.runtime.clearRefreshBoundaries();
  }

  private isRefreshableBranch(): boolean {
    if (this.committedBoundary !== null || this.committedBranch === null) {
      return false;
    }

    if (this.committedBranch.routes.some((entry) => !entry.runtime.isRefreshable())) {
      return false;
    }

    return this.committedBranch.child?.runtime.isRefreshableBranch() ?? true;
  }

  private isReusableBranch(): boolean {
    if (this.refreshBoundary !== null || !this.isRefreshableBranch() || this.committedBranch === null) {
      return false;
    }

    if (this.committedBranch.routes.some((entry) => !entry.runtime.isReusableForNavigation())) {
      return false;
    }

    return this.committedBranch.child?.runtime.isReusableBranch() ?? true;
  }

  private async runProviderRevalidation(signal: AbortSignal): Promise<void> {
    const pipeline = this.providerPipeline;

    if (!pipeline?.isCommitted) {
      return;
    }

    const context = createProviderContext(this.routerScope, signal);

    try {
      await pipeline.revalidate(context);
    } catch (error) {
      if (!signal.aborted) {
        this.refreshBoundary = { error, phase: 'failed' };
        this.emit();
        await this.reportRefreshFailure(error);
      }

      throw error;
    }
  }

  prepare(
    navigation: NavigationState,
    context: RouterRuntimePrepareContext,
  ): Promise<RouterRuntimePrepareResult<TPresentation>> {
    return this.startPreparation(navigation, context, true);
  }

  restart(
    navigation: NavigationState,
    context: RouterRuntimePrepareContext,
  ): Promise<RouterRuntimePrepareResult<TPresentation>> {
    return this.startPreparation(navigation, context, false);
  }

  private startPreparation(
    navigation: NavigationState,
    context: RouterRuntimePrepareContext,
    allowActivationReuse: boolean,
  ): Promise<RouterRuntimePrepareResult<TPresentation>> {
    const task = this.runPrepare(navigation, context, allowActivationReuse);

    this.preparationTasks.add(task);
    void task.then(
      () => this.preparationTasks.delete(task),
      () => this.preparationTasks.delete(task),
    );

    return task;
  }

  async confirm(navigation: NavigationState, context: RouterRuntimePrepareContext): Promise<boolean> {
    this.assertActive();

    const candidates = resolveNavigationCandidates(this.environment.rootRouter, navigation, this.committedNavigation);

    for (const candidate of candidates) {
      const plan = this.createPlan(candidate.target);

      try {
        stagePlanLocations(plan, candidate.navigation);
        throwIfAborted(context.signal);

        if (candidate.probeCanMatch) {
          const matches = await this.testPlanCanMatch(plan, context, context.signal);

          throwIfAborted(context.signal);

          if (!matches) {
            await this.discardPlan(plan);
            continue;
          }
        }

        const confirmed = await this.confirmNavigation(plan, context.signal);

        await this.discardPlan(plan);
        return confirmed;
      } catch (error) {
        await this.discardPlan(plan);
        throw error;
      }
    }

    return true;
  }

  subscribe(listener: RouterRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise;
    }

    if (this.snapshot.phase === 'disposed') {
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
    navigation: NavigationState,
    context: RouterRuntimePrepareContext,
    allowActivationReuse: boolean,
  ): Promise<RouterRuntimePrepareResult<TPresentation>> {
    this.assertActive();

    const revision = ++this.prepareRevision;
    const pendingBranchPlan = this.pendingBranchPlan;
    const pendingTransition = this.pendingTransition;

    this.refreshAbortController?.abort(new Error('Runtime refresh заменён новой навигацией.'));
    this.prepareAbortController?.abort(new Error('Router transition заменён новым переходом.'));

    if (pendingBranchPlan) {
      this.clearPendingBranch(pendingBranchPlan, true);
    }

    await pendingTransition?.transition.discard();
    this.setPendingNavigation(null, revision);

    if (this.isInterrupted(revision, context.signal)) {
      return createInterruptedResult(context.signal.reason);
    }

    const linkedSignal = createLinkedAbortController(context.signal);
    const abortController = linkedSignal.controller;

    this.prepareAbortController = abortController;

    try {
      const candidates = resolveNavigationCandidates(this.environment.rootRouter, navigation, this.committedNavigation);

      for (const candidate of candidates) {
        const activation = allowActivationReuse ? this.findActivation(candidate.navigation) : null;

        if (!activation || activation === this.focusedActivation) continue;

        const retained = await this.prepareRetainedActivation(
          candidate,
          activation,
          context,
          abortController,
          linkedSignal.dispose,
          revision,
        );

        if (retained !== null) return retained;
      }

      this.setSnapshot({ error: null, phase: 'preparing' });

      for (const candidate of candidates) {
        const result = await this.prepareCandidate(
          candidate,
          context,
          abortController,
          revision,
          linkedSignal.dispose,
          allowActivationReuse,
        );

        if (result !== null) {
          return result;
        }
      }

      linkedSignal.dispose();
      this.clearPendingNavigation(revision);
      this.restoreCommittedSnapshot();

      return {
        decision: { type: 'forbidden' },
        navigation,
        type: 'decision',
      };
    } catch (error) {
      linkedSignal.dispose();

      if (this.isInterrupted(revision, context.signal)) {
        this.clearPendingNavigation(revision);
        this.restoreCommittedSnapshot();
        return createInterruptedResult(context.signal.reason ?? error);
      }

      this.clearPendingNavigation(revision);
      this.setSnapshot({ error, phase: this.committedBranch ? 'active' : 'idle' });
      await this.reportActivationFailure(error);
      throw error;
    } finally {
      if (this.prepareAbortController === abortController && this.pendingTransition === null) {
        this.prepareAbortController = null;
      }
    }
  }

  private async prepareRetainedActivation(
    candidate: ResolvedNavigationCandidate,
    activation: RouterRuntimeActivation<TPresentation>,
    context: RouterRuntimePrepareContext,
    abortController: AbortController,
    disposeLinkedSignal: () => void,
    revision: number,
  ): Promise<RouterRuntimePrepareResult<TPresentation> | null> {
    const root = activation.getRootNode();

    if (candidate.probeCanMatch && !(await this.testActivationCanMatch(root, context, abortController.signal))) {
      return null;
    }

    const navigationConfirmed =
      context.blockersConfirmed || (await this.confirmActivation(activation, abortController.signal));

    if (!navigationConfirmed) {
      this.clearPendingNavigation(revision, candidate.navigation);
      disposeLinkedSignal();
      return createInterruptedResult(new Error('Навигация отменена blocker-решением.'));
    }

    for (const boundary of ['canMatch', 'canActivate'] as const) {
      const decision = await this.executeActivationPolicies(root, boundary, context, abortController.signal);

      if (decision.type !== 'continue') {
        disposeLinkedSignal();
        return this.applyPolicyDecision(decision, candidate.navigation, revision);
      }
    }

    this.setPendingNavigation(candidate.navigation, revision);
    let released = false;
    const release = (): void => {
      if (released) return;

      released = true;
      this.clearPendingNavigation(revision, candidate.navigation);
      disposeLinkedSignal();
    };

    const transition = new PreparedRouterTransition<TPresentation>({
      commit: async () => {
        await this.focusActivation(activation, candidate.navigation, abortController.signal);
        return activation;
      },
      complete: async () => undefined,
      discard: async () => {
        release();
      },
      getRouteRuntimes: () => activation.getRouteRuntimes(),
      navigation: candidate.navigation,
      publish: release,
    });

    return { transition, type: 'ready' };
  }

  private async testActivationCanMatch(
    node: RouterRuntimeActivationNode<TPresentation>,
    context: RouterRuntimePrepareContext,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (
      !(await node.runtime.policyRunner.test(
        node.runtime.definition.canMatch,
        createPolicyContext(EMPTY_PARAMS, context, signal),
      ))
    ) {
      return false;
    }

    for (const entry of node.branch?.routes ?? []) {
      if (!(await entry.runtime.testCanMatch(createPolicyContext(entry.runtime.getParams(), context, signal)))) {
        return false;
      }
    }

    return node.child ? await this.testActivationCanMatch(node.child, context, signal) : true;
  }

  private async executeActivationPolicies(
    node: RouterRuntimeActivationNode<TPresentation>,
    boundary: 'canActivate' | 'canMatch',
    context: RouterRuntimePrepareContext,
    signal: AbortSignal,
  ): Promise<PolicyBoundaryDecision> {
    const routerDecision = await node.runtime.policyRunner.execute(
      node.runtime.definition[boundary],
      createPolicyContext(EMPTY_PARAMS, context, signal),
    );

    if (routerDecision.type !== 'continue') return routerDecision;

    for (const entry of node.branch?.routes ?? []) {
      const routeDecision = await entry.runtime.executePolicyBoundary(
        boundary,
        createPolicyContext(entry.runtime.getParams(), context, signal),
      );

      if (routeDecision.type !== 'continue') return routeDecision;
    }

    return node.child
      ? await this.executeActivationPolicies(node.child, boundary, context, signal)
      : CONTINUE_POLICY_DECISION;
  }

  private async prepareCandidate(
    candidate: ResolvedNavigationCandidate,
    context: RouterRuntimePrepareContext,
    abortController: AbortController,
    revision: number,
    disposeLinkedSignal: () => void,
    allowActivationReuse: boolean,
  ): Promise<RouterRuntimePrepareResult<TPresentation> | null> {
    const plan = this.createPlan(candidate.target, allowActivationReuse);

    try {
      stagePlanLocations(plan, candidate.navigation);
      throwIfAborted(abortController.signal);

      if (candidate.probeCanMatch) {
        const matches = await this.testPlanCanMatch(plan, context, abortController.signal);

        throwIfAborted(abortController.signal);

        if (!matches) {
          await this.discardPlan(plan);
          return null;
        }
      }

      const navigationConfirmed =
        context.blockersConfirmed || (await this.confirmNavigation(plan, abortController.signal));

      throwIfAborted(abortController.signal);

      if (!navigationConfirmed) {
        await this.discardPlan(plan);
        this.clearPendingNavigation(revision, candidate.navigation);
        disposeLinkedSignal();
        this.restoreCommittedSnapshot();
        return createInterruptedResult(new Error('Навигация отменена blocker-решением.'));
      }

      const canMatchResult = await this.executePlanPolicies(plan, 'canMatch', context, abortController.signal);

      throwIfAborted(abortController.signal);

      if (canMatchResult) {
        return await this.preparePolicyBoundaryResult(
          candidate.navigation,
          plan,
          canMatchResult,
          'canMatch',
          context,
          abortController,
          revision,
          disposeLinkedSignal,
          allowActivationReuse,
        );
      }

      const canActivateResult = await this.executePlanPolicies(plan, 'canActivate', context, abortController.signal);

      throwIfAborted(abortController.signal);

      if (canActivateResult) {
        return await this.preparePolicyBoundaryResult(
          candidate.navigation,
          plan,
          canActivateResult,
          'canActivate',
          context,
          abortController,
          revision,
          disposeLinkedSignal,
          allowActivationReuse,
        );
      }

      throwIfAborted(abortController.signal);
      this.publishPendingBranch(plan, candidate.navigation, revision);
      const providerFailure = await this.preparePlans(
        createPlanPreparations(collectPlanPath(plan)),
        abortController.signal,
      );

      if (this.isInterrupted(revision, abortController.signal)) {
        await this.discardPlan(plan);
        this.clearPendingNavigation(revision, candidate.navigation);
        disposeLinkedSignal();
        this.restoreCommittedSnapshot();
        return createInterruptedResult(abortController.signal.reason);
      }

      return this.createReadyResult(
        candidate.navigation,
        plan,
        abortController,
        disposeLinkedSignal,
        providerFailure,
        allowActivationReuse,
        revision,
      );
    } catch (error) {
      const interrupted = this.isInterrupted(revision, abortController.signal);
      const interruptionReason = abortController.signal.reason;

      abortController.abort(error);
      await this.discardPlan(plan);

      if (interrupted) {
        this.clearPendingNavigation(revision, candidate.navigation);
        this.restoreCommittedSnapshot();
        return createInterruptedResult(interruptionReason ?? error);
      }

      throw error;
    }
  }

  private async preparePolicyBoundaryResult(
    navigation: NavigationState,
    plan: RouterTransitionPlan<TPresentation>,
    result: RouterPlanPolicyResult<TPresentation>,
    policyBoundary: 'canActivate' | 'canMatch',
    context: RouterRuntimePrepareContext,
    abortController: AbortController,
    revision: number,
    disposeLinkedSignal: () => void,
    allowActivationReuse: boolean,
  ): Promise<RouterRuntimePrepareResult<TPresentation>> {
    let terminalResult = result;
    const plans = collectPlanPath(plan);
    let boundaryIndex = plans.indexOf(terminalResult.plan);

    if (boundaryIndex < 0) {
      throw new Error('Policy boundary отсутствует в Router transition plan.');
    }

    if (policyBoundary === 'canMatch') {
      for (const ancestorPlan of plans.slice(0, boundaryIndex)) {
        const canActivateResult = await this.executeLocalPlanPolicies(
          ancestorPlan,
          'canActivate',
          context,
          abortController.signal,
        );

        if (canActivateResult) {
          terminalResult = canActivateResult;
          boundaryIndex = plans.indexOf(terminalResult.plan);
          break;
        }
      }

      if (terminalResult === result && terminalResult.owner.kind === 'route') {
        const canActivateResult = await this.executeRouteAncestorCanActivatePolicies(
          terminalResult.plan,
          terminalResult.owner.entry,
          context,
          abortController.signal,
        );

        if (canActivateResult) {
          terminalResult = canActivateResult;
          boundaryIndex = plans.indexOf(terminalResult.plan);
        }
      }
    }

    if (terminalResult.decision.type === 'redirect' || terminalResult.decision.type === 'redirect-to-saved-location') {
      await this.discardPlan(plan);
      disposeLinkedSignal();
      return this.applyPolicyDecision(terminalResult.decision, navigation, revision);
    }

    if (terminalResult.decision.type === 'continue') {
      throw new Error('Policy boundary result не может содержать continue.');
    }

    const error = terminalResult.decision.type === 'error' ? terminalResult.decision.error : null;
    const phase = terminalResult.decision.type === 'error' ? 'failed' : terminalResult.decision.type;
    const boundary: RuntimeBoundaryTransition<TPresentation> =
      terminalResult.owner.kind === 'route'
        ? {
            entry: terminalResult.owner.entry,
            error,
            kind: 'route',
            origin: 'policy',
            phase,
            plan: terminalResult.plan,
          }
        : {
            error,
            kind: 'router',
            phase,
            plan: terminalResult.plan,
          };
    const preparations =
      boundary.kind === 'route'
        ? createPreparationsBeforeRouteBoundary(plans, boundary)
        : createPlanPreparations(plans.slice(0, boundaryIndex));
    this.publishPendingBranch(plan, navigation, revision);
    const providerFailure = await this.preparePlans(preparations, abortController.signal);

    if (this.isInterrupted(revision, abortController.signal)) {
      await this.discardPlan(plan);
      this.clearPendingNavigation(revision, navigation);
      disposeLinkedSignal();
      this.restoreCommittedSnapshot();
      return createInterruptedResult(abortController.signal.reason);
    }

    if (boundary.error !== null) {
      if (boundary.kind === 'route') {
        await boundary.entry.runtime.reportBoundaryFailure(boundary.error);
      } else {
        await terminalResult.plan.runtime.reportActivationFailure(boundary.error);
      }
    }

    return this.createReadyResult(
      navigation,
      plan,
      abortController,
      disposeLinkedSignal,
      providerFailure ?? boundary,
      allowActivationReuse,
      revision,
    );
  }

  private confirmNavigation(plan: RouterTransitionPlan<TPresentation>, signal: AbortSignal): Promise<boolean> {
    const confirm = this.environment.execution.confirmNavigation;

    if (!confirm) {
      return Promise.resolve(true);
    }

    const leavingBoundaries = collectPlanNavigationBlockerBoundaries(plan);

    return leavingBoundaries.length === 0 ? Promise.resolve(true) : confirm(Object.freeze(leavingBoundaries), signal);
  }

  private async preparePlans(
    preparations: readonly RouterPlanPreparation<TPresentation>[],
    signal: AbortSignal,
  ): Promise<RuntimeBoundaryTransition<TPresentation> | null> {
    const providerPreparations = preparations.map(({ plan }) => this.preparePlanProvider(plan, signal));
    const [, providerFailures] = await Promise.all([
      this.preparePlanRoutes(preparations, signal),
      Promise.all(providerPreparations),
    ]);
    const providerFailure = providerFailures.find((failure) => failure !== null) ?? null;
    const routeFailure = findPreparedRouteFailure(preparations);
    const boundary = selectEarlierBoundary(preparations, providerFailure, routeFailure);
    const boundaryIndex = boundary
      ? preparations.findIndex((preparation) => preparation.plan === boundary.plan)
      : preparations.length - 1;
    const activatedPlans = preparations.slice(0, boundaryIndex + 1).map(({ plan }) => plan);
    const activationFailure = await this.activatePlanProviders(activatedPlans, signal);
    const effectiveBoundary = activationFailure ?? boundary;
    const effectiveBoundaryIndex = effectiveBoundary
      ? preparations.findIndex((preparation) => preparation.plan === effectiveBoundary.plan)
      : preparations.length - 1;

    await Promise.all(
      preparations.slice(effectiveBoundaryIndex + 1).map(({ plan }) => plan.runtime.providerPipeline?.discard()),
    );

    return effectiveBoundary;
  }

  private async preparePlanRoutes(
    preparations: readonly RouterPlanPreparation<TPresentation>[],
    signal: AbortSignal,
  ): Promise<void> {
    await Promise.all(
      preparations
        .flatMap((preparation) => preparation.routes)
        .map((entry) => {
          return entry.runtime.prepare({ params: entry.resolved.params, signal });
        }),
    );
  }

  private async preparePlanProvider(
    plan: RouterTransitionPlan<TPresentation>,
    signal: AbortSignal,
  ): Promise<RouterBoundaryTransition<TPresentation> | null> {
    if (!plan.localChanged || plan.runtime.definition.providers.length === 0) {
      return null;
    }

    const pipeline = plan.runtime.getOrCreateProviderPipeline();

    if (pipeline.isCommitted) return null;

    try {
      const providerContext = createProviderContext(plan.runtime.routerScope, signal);

      await pipeline.initialize(providerContext);
      await pipeline.prepare(providerContext);

      return null;
    } catch (error) {
      if (signal.aborted) {
        throw signal.reason ?? error;
      }

      await plan.runtime.reportActivationFailure(error);
      await plan.runtime.disposeProviderPipeline();

      return { error, kind: 'router', phase: 'failed', plan };
    }
  }

  private async activatePlanProviders(
    plans: readonly RouterTransitionPlan<TPresentation>[],
    signal: AbortSignal,
  ): Promise<RouterBoundaryTransition<TPresentation> | null> {
    let failure: RouterBoundaryTransition<TPresentation> | null = null;

    for (const plan of [...plans].reverse()) {
      const pipeline = plan.runtime.providerPipeline;

      if (!pipeline || pipeline.isCommitted || !plan.localChanged) continue;

      try {
        await pipeline.activate(createProviderContext(plan.runtime.routerScope, signal));
      } catch (error) {
        if (signal.aborted) throw signal.reason ?? error;

        await plan.runtime.reportActivationFailure(error);
        await plan.runtime.disposeProviderPipeline();
        failure = { error, kind: 'router', phase: 'failed', plan };
      }
    }

    return failure;
  }

  private createReadyResult(
    navigation: NavigationState,
    plan: RouterTransitionPlan<TPresentation>,
    abortController: AbortController,
    disposeLinkedSignal: () => void,
    boundary: RuntimeBoundaryTransition<TPresentation> | null,
    allowActivationReuse: boolean,
    revision: number,
  ): RouterRuntimePrepareResult<TPresentation> {
    const previousNavigation = this.committedNavigation;
    let pending!: PendingRouterTransition<TPresentation>;
    const transition = new PreparedRouterTransition<TPresentation>({
      commit: () => this.commitPreparedTransition(pending),
      complete: async ({ signal }) => {
        const plans = resolveNavigationRevalidationPlans(plan, navigation, previousNavigation);

        if (plans.length === 0 || signal.aborted) {
          return;
        }

        await Promise.all(
          plans.flatMap((target) => [
            target.runtime.runProviderRevalidation(signal),
            ...target.nextRoutes.map((entry) => entry.runtime.revalidate({ signal })),
          ]),
        );
      },
      discard: () => this.discardPreparedTransition(pending),
      getRouteRuntimes: () => Object.freeze(collectPlanRouteRuntimes(plan)),
      navigation,
      publish: () => this.releasePendingTransition(pending),
    });

    pending = {
      allowActivationReuse,
      abortController,
      boundary,
      disposeLinkedSignal,
      navigation,
      plan,
      revision,
      transition,
    };
    this.pendingTransition = pending;
    abortController.signal.addEventListener(
      'abort',
      () => {
        void transition.discard().catch(() => undefined);
      },
      { once: true },
    );
    this.setSnapshot({ error: null, phase: 'pending' });

    return { transition, type: 'ready' };
  }

  private async commitPreparedTransition(
    pending: PendingRouterTransition<TPresentation>,
  ): Promise<RouterRuntimeActivation<TPresentation>> {
    if (this.pendingTransition !== pending) {
      throw new Error('Router transition больше не является текущим.');
    }

    if (pending.abortController.signal.aborted) {
      await this.discardPreparedPlan(pending);
      throw pending.abortController.signal.reason ?? new Error('Router transition был прерван.');
    }

    this.clearRefreshBoundaries();
    this.clearPendingBranch(pending.plan, false);

    for (const plan of collectPlanPath(pending.plan)) {
      if (plan.runtime.providerPipeline?.hasPendingCommit) {
        plan.runtime.providerPipeline.commit();
      }
    }

    if (pending.boundary) {
      this.commitPlanRouteRuntimesBeforeBoundary(pending.plan, pending.boundary);
      this.applyBoundaryPlan(pending.plan, pending.boundary);
    } else {
      this.commitPlanRouteRuntimes(pending.plan);
      this.applyPlan(pending.plan);
    }

    this.committedNavigation = pending.navigation;
    const activation = await this.captureCommittedActivation(
      pending.navigation,
      pending.abortController.signal,
      pending.allowActivationReuse,
    );

    if (pending.boundary) {
      await this.disposeBoundaryReplacedBranch(pending.plan, pending.boundary);

      if (pending.boundary.kind === 'route') {
        await this.discardPlanAfterRouteBoundary(pending.boundary.plan, pending.boundary.entry);
      } else {
        await this.discardPlan(pending.boundary.plan);
      }
    } else {
      this.setSnapshot({ error: null, phase: 'active' });
      await this.disposeReplacedBranch(pending.plan);
    }

    return activation;
  }

  private async captureCommittedActivation(
    navigation: NavigationState,
    signal: AbortSignal,
    allowActivationReuse = true,
  ): Promise<RouterRuntimeActivation<TPresentation>> {
    const root = this.captureActivationNode();
    const existing = allowActivationReuse
      ? [...this.activations].find(
          (activation) =>
            activation.getSnapshot().phase !== 'released' && areActivationNodesEqual(activation.getRootNode(), root),
        )
      : undefined;
    const next =
      existing ?? new RouterRuntimeActivation(navigation, root, `activation:${++this.environment.activationSequence}`);

    await this.switchRouteFocus(this.focusedActivation?.getRootNode() ?? null, root, signal);

    if (!existing) {
      this.retainActivationNode(root);
      this.activations.add(next);
    } else {
      existing.updateNavigation(navigation);
    }

    if (this.focusedActivation !== next) {
      this.focusedActivation?.markRetained();
      next.markFocused();
      this.focusedActivation = next;
    }

    return next;
  }

  private captureActivationNode(): RouterRuntimeActivationNode<TPresentation> {
    return {
      boundary: this.committedBoundary ? Object.freeze({ ...this.committedBoundary }) : null,
      branch: this.committedBranch,
      child: this.committedBranch?.child?.runtime.captureActivationNode() ?? null,
      navigation: this.committedNavigation,
      runtime: this,
    };
  }

  private async switchRouteFocus(
    previous: RouterRuntimeActivationNode<TPresentation> | null,
    next: RouterRuntimeActivationNode<TPresentation>,
    signal: AbortSignal,
  ): Promise<void> {
    const previousRoutes = new Set(previous ? collectActivationRouteRuntimes(previous) : []);
    const nextRoutes = new Set(collectActivationRouteRuntimes(next));
    const leaving = [...previousRoutes].filter((runtime) => !nextRoutes.has(runtime)).reverse();
    const entering = [...nextRoutes].filter((runtime) => !previousRoutes.has(runtime));

    for (const runtime of leaving) {
      if (runtime.getSnapshot().phase === 'active') await runtime.retain();
    }

    for (const runtime of entering) {
      if (runtime.getSnapshot().phase === 'retained') await runtime.focus(signal);
    }
  }

  private restoreActivationNode(node: RouterRuntimeActivationNode<TPresentation>, navigation: NavigationState): void {
    const runtime = node.runtime;

    runtime.committedBoundary = node.boundary;
    runtime.committedBranch = node.branch;
    runtime.committedNavigation = navigation;
    runtime.refreshBoundary = null;
    runtime.snapshot = node.boundary ?? { error: null, phase: node.branch === null ? 'idle' : 'active' };
    runtime.emit();

    if (node.child) runtime.restoreActivationNode(node.child, navigation);
  }

  private async releaseActivationNode(node: RouterRuntimeActivationNode<TPresentation>): Promise<void> {
    if (node.child) {
      await this.releaseActivationNode(node.child);
    }

    for (const entry of [...(node.branch?.routes ?? [])].reverse()) {
      await entry.ownerRuntime.release(entry.runtime);
    }

    const references = this.environment.routerReferences.get(node.runtime);

    if (references === undefined || references <= 0) {
      throw new Error('Router activation освобождается без удерживающей navigation activation.');
    }

    if (references > 1) {
      this.environment.routerReferences.set(node.runtime, references - 1);
      return;
    }

    this.environment.routerReferences.delete(node.runtime);

    if (node.runtime !== this.environment.rootRuntime) {
      node.runtime.committedBranch = null;
      node.runtime.committedBoundary = null;
      node.runtime.committedNavigation = undefined;
      await node.runtime.dispose();
    }
  }

  private retainActivationNode(node: RouterRuntimeActivationNode<TPresentation>): void {
    this.environment.routerReferences.set(node.runtime, (this.environment.routerReferences.get(node.runtime) ?? 0) + 1);

    for (const entry of node.branch?.routes ?? []) {
      entry.ownerRuntime.retain(entry.runtime);
    }

    if (node.child) this.retainActivationNode(node.child);
  }

  private async discardPreparedTransition(pending: PendingRouterTransition<TPresentation>): Promise<void> {
    if (this.pendingTransition !== pending) {
      return;
    }

    await this.discardPreparedPlan(pending);
  }

  private async discardPreparedPlan(pending: PendingRouterTransition<TPresentation>): Promise<void> {
    this.releasePendingTransition(pending);
    await this.discardPlan(pending.plan);
    this.restoreCommittedSnapshot();
  }

  private releasePendingTransition(pending: PendingRouterTransition<TPresentation>): void {
    if (this.pendingTransition === pending) {
      this.pendingTransition = null;
    }

    if (this.prepareAbortController === pending.abortController) {
      this.prepareAbortController = null;
    }

    this.clearPendingNavigation(pending.revision, pending.navigation);
    pending.disposeLinkedSignal();
  }

  private createPlan(target: ResolvedRouterTarget, allowActivationReuse = true): RouterTransitionPlan<TPresentation> {
    if (target.router !== this.router) {
      throw new Error('Resolved target принадлежит другому RouterRuntime.');
    }

    const previousBranch = this.committedBranch;
    this.queryService?.stage(target.query);
    const previousRoutes = previousBranch?.routes ?? [];
    const commonRouteCount =
      allowActivationReuse && this.isReusableBranch() ? getCommonRouteCount(previousRoutes, target.routes) : 0;
    const nextRoutes: RuntimeRouteEntry<TPresentation>[] = [...previousRoutes.slice(0, commonRouteCount)];
    const createdRoutes: RuntimeRouteEntry<TPresentation>[] = [];
    let parentScope: RuntimeScope =
      commonRouteCount > 0 ? nextRoutes[commonRouteCount - 1]!.runtime.getRouteScope() : this.routerScope;

    for (const resolved of target.routes.slice(commonRouteCount)) {
      const ownerRuntime = this.getOrCreateRouteRuntime(resolved, parentScope);
      const { activation: runtime, created } = ownerRuntime.acquire(resolved.params, {
        reuse: allowActivationReuse,
      });
      const entry = Object.freeze({ ownerRuntime, resolved, runtime });

      if (created) createdRoutes.push(entry);
      nextRoutes.push(entry);
      parentScope = runtime.getRouteScope();
    }

    let childPlan: RouterTransitionPlan<TPresentation> | null = null;
    let createdChild = false;
    let nextChild: RouterRuntime<TPresentation> | null = null;
    let nextChildOwner: RouteActivationRuntime<TPresentation> | null = null;

    if (target.child) {
      const childOwnerIndex = nextRoutes.findIndex((entry) => entry.resolved.node.route === target.child!.owner);

      if (childOwnerIndex < 0) {
        throw new Error('Nested Router target не содержит активную owner Route.');
      }

      const childOwner = nextRoutes[childOwnerIndex]!;
      nextChildOwner = childOwner.runtime;
      const canReuseChild =
        previousBranch?.child !== null &&
        previousBranch?.child !== undefined &&
        previousBranch.child.runtime.router === target.child.router &&
        previousBranch.child.runtime.isReusableBranch() &&
        childOwnerIndex < commonRouteCount;

      nextChild = canReuseChild
        ? previousBranch!.child!.runtime
        : new RouterRuntime(
            target.child.router,
            childOwner.runtime.getRouteScope(),
            this.environment.exportResolver,
            this.environment.execution,
            this.getRouterRuntimeId(target.child.router),
            this.environment,
          );
      createdChild = !canReuseChild;
      childPlan = nextChild!.createPlan(target.child, allowActivationReuse);
    }

    return {
      childPlan,
      commonRouteCount,
      createdChild,
      createdRoutes: Object.freeze(createdRoutes),
      localChanged: commonRouteCount !== previousRoutes.length || commonRouteCount !== target.routes.length,
      nextChild,
      nextChildOwner,
      nextRoutes: Object.freeze(nextRoutes),
      previousBranch,
      query: target.query,
      runtime: this,
    };
  }

  private async testPlanCanMatch(
    plan: RouterTransitionPlan<TPresentation>,
    context: RouterRuntimePrepareContext,
    signal: AbortSignal,
  ): Promise<boolean> {
    throwIfAborted(signal);

    if (
      !(await plan.runtime.policyRunner.test(
        plan.runtime.definition.canMatch,
        createPolicyContext(EMPTY_PARAMS, context, signal),
      ))
    ) {
      return false;
    }

    throwIfAborted(signal);

    for (const entry of plan.nextRoutes) {
      if (!(await entry.runtime.testCanMatch(createPolicyContext(entry.resolved.params, context, signal)))) {
        return false;
      }

      throwIfAborted(signal);
    }

    return plan.childPlan ? await this.testPlanCanMatch(plan.childPlan, context, signal) : true;
  }

  private async executePlanPolicies(
    plan: RouterTransitionPlan<TPresentation>,
    boundary: 'canActivate' | 'canMatch',
    context: RouterRuntimePrepareContext,
    signal: AbortSignal,
  ): Promise<RouterPlanPolicyResult<TPresentation> | null> {
    throwIfAborted(signal);

    const localResult = await this.executeLocalPlanPolicies(plan, boundary, context, signal);

    if (localResult) {
      return localResult;
    }

    return plan.childPlan ? await this.executePlanPolicies(plan.childPlan, boundary, context, signal) : null;
  }

  private async executeLocalPlanPolicies(
    plan: RouterTransitionPlan<TPresentation>,
    boundary: 'canActivate' | 'canMatch',
    context: RouterRuntimePrepareContext,
    signal: AbortSignal,
  ): Promise<RouterPlanPolicyResult<TPresentation> | null> {
    throwIfAborted(signal);

    if (plan.localChanged) {
      const routerDecision = await plan.runtime.policyRunner.execute(
        plan.runtime.definition[boundary],
        createPolicyContext(EMPTY_PARAMS, context, signal),
      );

      throwIfAborted(signal);

      if (routerDecision.type !== 'continue') {
        return { decision: routerDecision, owner: { kind: 'router' }, plan };
      }

      for (const entry of plan.createdRoutes) {
        const routeDecision = await entry.runtime.executePolicyBoundary(
          boundary,
          createPolicyContext(entry.resolved.params, context, signal),
        );

        throwIfAborted(signal);

        if (routeDecision.type !== 'continue') {
          return { decision: routeDecision, owner: { entry, kind: 'route' }, plan };
        }
      }
    }

    return null;
  }

  private async executeRouteAncestorCanActivatePolicies(
    plan: RouterTransitionPlan<TPresentation>,
    boundaryEntry: RuntimeRouteEntry<TPresentation>,
    context: RouterRuntimePrepareContext,
    signal: AbortSignal,
  ): Promise<RouterPlanPolicyResult<TPresentation> | null> {
    throwIfAborted(signal);

    const routerDecision = await plan.runtime.policyRunner.execute(
      plan.runtime.definition.canActivate,
      createPolicyContext(EMPTY_PARAMS, context, signal),
    );

    throwIfAborted(signal);

    if (routerDecision.type !== 'continue') {
      return { decision: routerDecision, owner: { kind: 'router' }, plan };
    }

    for (const entry of plan.createdRoutes) {
      if (entry === boundaryEntry) {
        return null;
      }

      const routeDecision = await entry.runtime.executePolicyBoundary(
        'canActivate',
        createPolicyContext(entry.resolved.params, context, signal),
      );

      throwIfAborted(signal);

      if (routeDecision.type !== 'continue') {
        return { decision: routeDecision, owner: { entry, kind: 'route' }, plan };
      }
    }

    throw new Error('Route policy boundary отсутствует в created Route runtimes transition plan.');
  }

  private applyPolicyDecision(
    decision: PolicyBoundaryDecision,
    navigation: NavigationState,
    revision: number,
  ): RouterRuntimePrepareResult<TPresentation> {
    this.clearPendingNavigation(revision, navigation);
    this.restoreCommittedSnapshot();

    if (decision.type === 'error') {
      throw decision.error;
    }

    return { decision, navigation, type: 'decision' };
  }

  private commitPlanRouteRuntimes(plan: RouterTransitionPlan<TPresentation>): void {
    for (const entry of plan.createdRoutes) {
      entry.runtime.commit();
    }

    if (plan.childPlan) {
      this.commitPlanRouteRuntimes(plan.childPlan);
    }
  }

  private commitPlanRouteRuntimesBeforeBoundary(
    plan: RouterTransitionPlan<TPresentation>,
    boundary: RuntimeBoundaryTransition<TPresentation>,
  ): void {
    if (plan === boundary.plan) {
      if (boundary.kind === 'route') {
        for (const entry of plan.createdRoutes) {
          if (entry === boundary.entry) {
            if (boundary.origin === 'policy') {
              entry.runtime.commitBoundary(boundary.phase, boundary.error, entry.resolved.params);
            } else {
              entry.runtime.commit();
            }

            return;
          }

          entry.runtime.commit();
        }

        throw new Error('Route boundary отсутствует в created Route runtimes transition plan.');
      }

      return;
    }

    for (const entry of plan.createdRoutes) {
      entry.runtime.commit();
    }

    if (plan.childPlan) {
      this.commitPlanRouteRuntimesBeforeBoundary(plan.childPlan, boundary);
    }
  }

  private applyPlan(plan: RouterTransitionPlan<TPresentation>): void {
    plan.runtime.committedBranch = {
      child:
        plan.nextChild && plan.nextChildOwner
          ? Object.freeze({ owner: plan.nextChildOwner, runtime: plan.nextChild })
          : null,
      routes: plan.nextRoutes,
    };
    plan.runtime.committedBoundary = null;
    plan.runtime.snapshot = { error: null, phase: 'active' };

    if (plan.childPlan) {
      this.applyPlan(plan.childPlan);
    }

    if (plan.runtime !== this) {
      plan.runtime.emit();
    }
  }

  private applyBoundaryPlan(
    plan: RouterTransitionPlan<TPresentation>,
    boundary: RuntimeBoundaryTransition<TPresentation>,
  ): void {
    if (plan === boundary.plan) {
      if (boundary.kind === 'route') {
        const boundaryIndex = plan.nextRoutes.indexOf(boundary.entry);

        if (boundaryIndex < 0) {
          throw new Error('Route boundary отсутствует в next Route runtimes transition plan.');
        }

        plan.runtime.committedBranch = {
          child: null,
          routes: Object.freeze(plan.nextRoutes.slice(0, boundaryIndex + 1)),
        };
        plan.runtime.committedBoundary = null;
        plan.runtime.snapshot = { error: null, phase: 'active' };
      } else {
        plan.runtime.committedBranch = null;
        plan.runtime.committedBoundary = { error: boundary.error, phase: boundary.phase };
        plan.runtime.snapshot = plan.runtime.committedBoundary;
      }

      if (plan.runtime !== this) {
        plan.runtime.emit();
      } else {
        this.emit();
      }

      return;
    }

    plan.runtime.committedBranch = {
      child:
        plan.nextChild && plan.nextChildOwner
          ? Object.freeze({ owner: plan.nextChildOwner, runtime: plan.nextChild })
          : null,
      routes: plan.nextRoutes,
    };
    plan.runtime.committedBoundary = null;
    plan.runtime.snapshot = { error: null, phase: 'active' };

    if (!plan.childPlan) {
      throw new Error('Boundary Router отсутствует в дочернем transition plan.');
    }

    this.applyBoundaryPlan(plan.childPlan, boundary);

    if (plan.runtime !== this) {
      plan.runtime.emit();
    } else {
      this.emit();
    }
  }

  private async disposeReplacedBranch(plan: RouterTransitionPlan<TPresentation>): Promise<void> {
    const previousChild = plan.previousBranch?.child?.runtime ?? null;

    if (previousChild && previousChild !== plan.nextChild) {
      if (!this.environment.routerReferences.has(previousChild)) await previousChild.dispose();
    } else if (plan.childPlan) {
      await this.disposeReplacedBranch(plan.childPlan);
    }

    const replacedRoutes = plan.previousBranch?.routes.slice(plan.commonRouteCount).reverse() ?? [];

    for (const entry of replacedRoutes) {
      await this.disposeRouteEntry(entry, 'route.dispose');
    }
  }

  private async disposeBoundaryReplacedBranch(
    plan: RouterTransitionPlan<TPresentation>,
    boundary: RuntimeBoundaryTransition<TPresentation>,
  ): Promise<void> {
    if (plan === boundary.plan) {
      if (boundary.kind === 'router') {
        await plan.runtime.disposeBranch(plan.previousBranch);
        return;
      }

      if (plan.previousBranch?.child) {
        if (!this.environment.routerReferences.has(plan.previousBranch.child.runtime)) {
          await plan.previousBranch.child.runtime.dispose();
        }
      }

      const replacedRoutes = plan.previousBranch?.routes.slice(plan.commonRouteCount).reverse() ?? [];

      for (const entry of replacedRoutes) {
        await this.disposeRouteEntry(entry, 'route.dispose');
      }

      return;
    }

    const previousChild = plan.previousBranch?.child?.runtime ?? null;

    if (previousChild && previousChild !== plan.nextChild) {
      if (!this.environment.routerReferences.has(previousChild)) await previousChild.dispose();
    } else if (plan.childPlan) {
      await this.disposeBoundaryReplacedBranch(plan.childPlan, boundary);
    }

    const replacedRoutes = plan.previousBranch?.routes.slice(plan.commonRouteCount).reverse() ?? [];

    for (const entry of replacedRoutes) {
      await this.disposeRouteEntry(entry, 'route.dispose');
    }
  }

  private async discardPlan(plan: RouterTransitionPlan<TPresentation>): Promise<void> {
    this.clearPendingBranch(plan, true);
    plan.runtime.queryService?.discardPending();
    await plan.runtime.providerPipeline?.discard();

    if (plan.childPlan) {
      await this.discardPlan(plan.childPlan);
    }

    if (plan.createdChild && plan.nextChild) {
      await plan.nextChild.dispose();
    }

    for (const entry of [...plan.createdRoutes].reverse()) {
      entry.runtime.discardPending();
      await this.disposeRouteEntry(entry, 'route.discard');
    }
  }

  private async discardPlanAfterRouteBoundary(
    plan: RouterTransitionPlan<TPresentation>,
    boundaryEntry: RuntimeRouteEntry<TPresentation>,
  ): Promise<void> {
    if (plan.childPlan) {
      await this.discardPlan(plan.childPlan);
    }

    if (plan.createdChild && plan.nextChild) {
      await plan.nextChild.dispose();
    }

    const boundaryIndex = plan.createdRoutes.indexOf(boundaryEntry);

    if (boundaryIndex < 0) {
      throw new Error('Route boundary отсутствует в created Route runtimes transition plan.');
    }

    for (const entry of [...plan.createdRoutes.slice(boundaryIndex + 1)].reverse()) {
      entry.runtime.discardPending();
      await this.disposeRouteEntry(entry, 'route.discard');
    }
  }

  private async runDispose(): Promise<void> {
    this.prepareRevision += 1;
    const pendingTransition = this.pendingTransition;

    this.snapshot = { error: null, phase: 'disposing' };
    this.emit();
    this.lifecycleAbortController.abort(new Error('RouterRuntime освобождён.'));
    this.refreshAbortController?.abort(new Error('RouterRuntime освобождён.'));
    this.prepareAbortController?.abort(new Error('RouterRuntime освобождён.'));
    await pendingTransition?.transition.discard();
    await Promise.allSettled([...this.preparationTasks, ...(this.refreshPromise ? [this.refreshPromise] : [])]);

    const branch = this.committedBranch;
    const activations = [...this.activations];

    this.activations.clear();
    this.focusedActivation = null;
    this.committedBoundary = null;
    this.committedBranch = null;
    this.committedNavigation = undefined;
    this.pendingNavigation = null;
    this.pendingNavigationRevision = 0;
    this.refreshBoundary = null;
    this.snapshot = { error: null, phase: 'disposed' };
    this.emit();

    if (activations.length > 0) {
      for (const activation of activations) {
        activation.markReleased();
        await this.releaseActivationNode(activation.getRootNode());
      }
    } else {
      await this.disposeBranch(branch);
    }
    await this.disposeProviderPipeline();

    try {
      this.queryService?.dispose();
      this.routerScope.dispose();
    } catch (error) {
      await this.reportCleanupFailure(error, 'scope.dispose');
    }

    this.listeners.clear();
  }

  private async disposeBranch(branch: RouterRuntimeBranch<TPresentation> | null): Promise<void> {
    if (branch?.child) {
      await branch.child.runtime.dispose();
    }

    for (const entry of [...(branch?.routes ?? [])].reverse()) {
      await this.disposeRouteEntry(entry, 'route.dispose');
    }
  }

  private async disposeRouteEntry(entry: RuntimeRouteEntry<TPresentation>, operation: string): Promise<void> {
    try {
      await entry.ownerRuntime.discard(entry.runtime);
    } catch (error) {
      await this.reportCleanupFailure(error, operation);
    }
  }

  private async reportActivationFailure(error: unknown): Promise<void> {
    const failure = captureRuntimeFailure(error, {
      operation: 'prepare',
      owner: this.owner,
      participant: { kind: 'runtime' },
    });

    await reportRuntimeFailure(
      this.routerScope.get(RuntimeFailureReporterInterface),
      failure,
      this.owner,
      'route.activation-failed',
      this.committedBranch ? 'active' : 'idle',
    );
  }

  private async reportRenderFailure(error: unknown): Promise<void> {
    const failure = captureRuntimeFailure(error, {
      operation: 'render',
      owner: this.owner,
      participant: { kind: 'runtime' },
    });

    await reportRuntimeFailure(
      this.routerScope.get(RuntimeFailureReporterInterface),
      failure,
      this.owner,
      'route.activation-failed',
      'failed',
    );
  }

  private async reportActionFailure(error: unknown): Promise<void> {
    const failure = captureRuntimeFailure(error, {
      operation: 'action',
      owner: this.owner,
      participant: { kind: 'runtime' },
    });

    await reportRuntimeFailure(
      this.routerScope.get(RuntimeFailureReporterInterface),
      failure,
      this.owner,
      'action.failed',
      'active',
    );
  }

  private async reportRefreshFailure(error: unknown): Promise<void> {
    const failure = captureRuntimeFailure(error, {
      operation: 'revalidate',
      owner: this.owner,
      participant: { kind: 'runtime' },
    });

    await reportRuntimeFailure(
      this.routerScope.get(RuntimeFailureReporterInterface),
      failure,
      this.owner,
      'revalidate.failed',
      'failed',
    );
  }

  private async reportCleanupFailure(error: unknown, operation: string): Promise<void> {
    const failure = captureRuntimeFailure(error, {
      operation,
      owner: this.owner,
      participant: { kind: 'runtime' },
    });

    await reportRuntimeFailure(
      this.routerScope.get(RuntimeFailureReporterInterface),
      failure,
      this.owner,
      'cleanup.contained',
      'disposing',
    );
  }

  private getRouteRuntimeId(entry: ResolvedRouteEntry): string {
    const index = this.environment.routeIndexes.get(entry.node.route);

    if (index === undefined) {
      throw new Error('Route отсутствует в RouterRuntime environment.');
    }

    return `route:${index}`;
  }

  private getOrCreateRouteRuntime(entry: ResolvedRouteEntry, ownerScope: RuntimeScope): RouteRuntime<TPresentation> {
    let runtimes = this.routeRuntimes.get(ownerScope);

    if (!runtimes) {
      runtimes = new Map();
      this.routeRuntimes.set(ownerScope, runtimes);
    }

    const existing = runtimes.get(entry.node.route);

    if (existing) return existing;

    const runtime = new RouteRuntime(
      entry.node.route,
      ownerScope,
      this.environment.exportResolver,
      this.getRouteRuntimeId(entry),
      {
        executeAction: (execution) => this.executeRouteAction(execution),
        onRenderFailure: (failedRuntime, error) => this.trimCommittedRouteBranch(failedRuntime, error),
      },
    );

    runtimes.set(entry.node.route, runtime);

    return runtime;
  }

  private getOrCreateProviderPipeline(): ProviderPipeline {
    this.providerPipeline ??= new ProviderPipeline(this.routerScope, this.definition.providers, this.owner);

    return this.providerPipeline;
  }

  private async disposeProviderPipeline(): Promise<void> {
    const pipeline = this.providerPipeline;

    this.providerPipeline = null;
    await pipeline?.dispose();
  }

  private getRouterRuntimeId(router: RouterDeclaration): string {
    const index = this.environment.routerIndexes.get(router);

    if (index === undefined) {
      throw new Error('Router отсутствует в RouterRuntime environment.');
    }

    return `router:${index}`;
  }

  private isInterrupted(revision: number, signal: AbortSignal): boolean {
    return (
      revision !== this.prepareRevision ||
      signal.aborted ||
      this.snapshot.phase === 'disposed' ||
      this.snapshot.phase === 'disposing'
    );
  }

  private restoreCommittedSnapshot(): void {
    if (this.snapshot.phase === 'disposed' || this.snapshot.phase === 'disposing') {
      return;
    }

    this.setSnapshot(this.committedBoundary ?? { error: null, phase: this.committedBranch ? 'active' : 'idle' });
  }

  private clearPendingNavigation(revision: number, navigation?: NavigationState): void {
    if (
      this.pendingNavigationRevision === revision &&
      (navigation === undefined || this.pendingNavigation === navigation)
    ) {
      this.setPendingNavigation(null, revision);
    }
  }

  private setPendingNavigation(navigation: NavigationState | null, revision: number): void {
    if (revision !== this.prepareRevision) {
      return;
    }

    if (this.pendingNavigation === navigation && this.pendingNavigationRevision === revision) {
      return;
    }

    this.pendingNavigation = navigation;
    this.pendingNavigationRevision = navigation === null ? 0 : revision;
    this.emitBranchChange();
  }

  private publishPendingBranch(
    plan: RouterTransitionPlan<TPresentation>,
    navigation: NavigationState,
    revision: number,
  ): void {
    this.setPendingNavigation(navigation, revision);
    const plans = collectPlanPath(plan);

    for (const pendingPlan of plans) {
      if (pendingPlan.runtime.pendingBranchPlan !== null) {
        throw new Error('RouterRuntime уже содержит опубликованную pending-ветку.');
      }

      pendingPlan.runtime.pendingBranchPlan = pendingPlan;
    }

    for (const pendingPlan of plans) {
      pendingPlan.runtime.emitBranchChange();
    }
  }

  private clearPendingBranch(plan: RouterTransitionPlan<TPresentation>, notify: boolean): void {
    const runtimes: RouterRuntime<TPresentation>[] = [];

    for (const pendingPlan of collectPlanPath(plan)) {
      if (pendingPlan.runtime.pendingBranchPlan !== pendingPlan) {
        continue;
      }

      pendingPlan.runtime.pendingBranchPlan = null;
      runtimes.push(pendingPlan.runtime);
    }

    if (notify) {
      for (const runtime of runtimes) {
        runtime.emitBranchChange();
      }
    }
  }

  private emitBranchChange(): void {
    if (this.refreshBoundary) {
      this.refreshBoundary = { ...this.refreshBoundary };
    } else {
      this.snapshot = { ...this.snapshot };
    }

    this.emit();
  }

  private setSnapshot(snapshot: RouterRuntimeSnapshot): void {
    this.snapshot = snapshot;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertActive(): void {
    if (this.snapshot.phase === 'disposed' || this.snapshot.phase === 'disposing') {
      throw new Error('RouterRuntime уже освобождён.');
    }
  }
}

const createEnvironment = <TPresentation>(
  rootRouter: RouterDeclaration,
  exportResolver: ModuleExportResolverInterface<TPresentation>,
  execution: RouterRuntimeExecutionContext,
): RouterRuntimeEnvironment<TPresentation> => {
  const graph = getRouterGraph(rootRouter);
  const routers: RouterDeclaration[] = [rootRouter];

  for (const node of graph.nodes) {
    if (!routers.includes(node.router)) {
      routers.push(node.router);
    }
  }

  return {
    activationSequence: 0,
    execution,
    exportResolver,
    rootRouter,
    routeIndexes: new Map(graph.nodes.map((node, index) => [node.route, index])),
    rootRuntime: null,
    routerIndexes: new Map(routers.map((router, index) => [router, index])),
    routerReferences: new Map(),
  };
};

const getCommonRouteCount = <TPresentation>(
  current: readonly RuntimeRouteEntry<TPresentation>[],
  target: readonly ResolvedRouteEntry[],
): number => {
  const length = Math.min(current.length, target.length);
  let index = 0;

  while (
    index < length &&
    current[index]!.resolved.node === target[index]!.node &&
    current[index]!.runtime.isReusableForNavigation() &&
    areNavigationParamsEqual(current[index]!.resolved.params, target[index]!.params)
  ) {
    index += 1;
  }

  return index;
};

const resolveNavigationRevalidationPlans = <TPresentation>(
  plan: RouterTransitionPlan<TPresentation>,
  navigation: NavigationState,
  previous: NavigationState | undefined,
): readonly RouterTransitionPlan<TPresentation>[] => {
  if (!navigation.revalidation || hasPlanChanges(plan)) {
    return [];
  }

  const plans = collectPlanPath(plan);

  switch (navigation.revalidation.kind) {
    case 'branch':
      return plans;
    case 'router': {
      const router = navigation.revalidation.router;
      return plans.filter((candidate) => candidate.runtime.router === router);
    }
    case 'restore': {
      const changed = previous ? collectChangedQueryRouters(previous.root, navigation.root) : [];
      return changed.length > 0 ? plans.filter((candidate) => changed.includes(candidate.runtime.router)) : plans;
    }
  }
};

const collectChangedQueryRouters = (
  previous: NavigationRouterState,
  current: NavigationRouterState,
): readonly RouterDeclaration[] => {
  const routers: RouterDeclaration[] = [];
  let left: NavigationRouterState | null = previous;
  let right: NavigationRouterState | null = current;

  while (left && right && left.router === right.router) {
    if (!areNavigationQueriesEqual(left.query, right.query)) routers.push(right.router);
    left = left.child;
    right = right.child;
  }

  return routers;
};

const hasPlanChanges = <TPresentation>(plan: RouterTransitionPlan<TPresentation>): boolean => {
  return plan.localChanged || (plan.childPlan !== null && hasPlanChanges(plan.childPlan));
};

const stagePlanLocations = <TPresentation>(
  plan: RouterTransitionPlan<TPresentation>,
  navigation: NavigationState,
): void => {
  for (const entry of plan.createdRoutes) {
    entry.runtime.stageLocation(entry.resolved.params, navigation.state);
  }

  if (plan.childPlan) {
    stagePlanLocations(plan.childPlan, navigation);
  }
};

const collectPlanPath = <TPresentation>(
  root: RouterTransitionPlan<TPresentation>,
): readonly RouterTransitionPlan<TPresentation>[] => {
  const plans: RouterTransitionPlan<TPresentation>[] = [];
  let plan: RouterTransitionPlan<TPresentation> | null = root;

  while (plan) {
    plans.push(plan);
    plan = plan.childPlan;
  }

  return plans;
};

const collectActivationRouteRuntimes = <TPresentation>(
  root: RouterRuntimeActivationNode<TPresentation>,
): RouteActivationRuntime<TPresentation>[] => {
  const runtimes = [...(root.branch?.routes.map((entry) => entry.runtime) ?? [])];

  if (root.child) {
    runtimes.push(...collectActivationRouteRuntimes(root.child));
  }

  return runtimes;
};

const createActivationTreeSnapshot = <TPresentation>(
  node: RouterRuntimeActivationNode<TPresentation>,
): RouterRuntimeActivationTree<TPresentation> => {
  const child = node.child;
  const childOwner = node.branch?.child?.owner ?? null;

  if ((child === null) !== (childOwner === null)) {
    throw new Error('Router activation tree содержит несогласованный дочерний Router.');
  }

  return Object.freeze({
    child: child && childOwner ? Object.freeze({ owner: childOwner, tree: createActivationTreeSnapshot(child) }) : null,
    routes: Object.freeze(node.branch?.routes.map((entry) => entry.runtime) ?? []),
    runtime: node.runtime,
    snapshot:
      node.boundary ??
      Object.freeze({
        error: null,
        phase: node.branch === null ? 'idle' : 'active',
      }),
  });
};

const areActivationNodesEqual = <TPresentation>(
  left: RouterRuntimeActivationNode<TPresentation>,
  right: RouterRuntimeActivationNode<TPresentation>,
): boolean => {
  const leftRoutes = left.branch?.routes ?? [];
  const rightRoutes = right.branch?.routes ?? [];

  return (
    left.runtime === right.runtime &&
    left.boundary?.phase === right.boundary?.phase &&
    leftRoutes.length === rightRoutes.length &&
    leftRoutes.every((entry, index) => entry.runtime === rightRoutes[index]?.runtime) &&
    (left.child === null || right.child === null
      ? left.child === right.child
      : areActivationNodesEqual(left.child, right.child))
  );
};

const areActivationNavigationsEqual = (left: NavigationState, right: NavigationState): boolean => {
  return (
    left.boundary?.type === right.boundary?.type &&
    left.boundary?.route === right.boundary?.route &&
    left.boundary?.router === right.boundary?.router &&
    matchesNavigationState(left, right) &&
    matchesNavigationState(right, left)
  );
};

const createPlanPreparations = <TPresentation>(
  plans: readonly RouterTransitionPlan<TPresentation>[],
): readonly RouterPlanPreparation<TPresentation>[] => {
  return plans.map((plan) => ({ plan, routes: plan.createdRoutes }));
};

const createPreparationsBeforeRouteBoundary = <TPresentation>(
  plans: readonly RouterTransitionPlan<TPresentation>[],
  boundary: RouteBoundaryTransition<TPresentation>,
): readonly RouterPlanPreparation<TPresentation>[] => {
  const boundaryPlanIndex = plans.indexOf(boundary.plan);
  const boundaryRouteIndex = boundary.plan.createdRoutes.indexOf(boundary.entry);

  if (boundaryPlanIndex < 0 || boundaryRouteIndex < 0) {
    throw new Error('Route policy boundary отсутствует в transition plan.');
  }

  return plans.slice(0, boundaryPlanIndex + 1).map((plan) => ({
    plan,
    routes: plan === boundary.plan ? plan.createdRoutes.slice(0, boundaryRouteIndex) : plan.createdRoutes,
  }));
};

const findPreparedRouteFailure = <TPresentation>(
  preparations: readonly RouterPlanPreparation<TPresentation>[],
): RouteBoundaryTransition<TPresentation> | null => {
  for (const preparation of preparations) {
    for (const entry of preparation.routes) {
      const failure = entry.runtime.getPendingFailureOrNull();

      if (failure) {
        return {
          entry,
          error: failure.error,
          kind: 'route',
          origin: 'runtime',
          phase: 'failed',
          plan: preparation.plan,
        };
      }
    }
  }

  return null;
};

const selectEarlierBoundary = <TPresentation>(
  preparations: readonly RouterPlanPreparation<TPresentation>[],
  providerFailure: RouterBoundaryTransition<TPresentation> | null,
  routeFailure: RouteBoundaryTransition<TPresentation> | null,
): RuntimeBoundaryTransition<TPresentation> | null => {
  if (!providerFailure) return routeFailure;
  if (!routeFailure) return providerFailure;

  const providerIndex = preparations.findIndex(({ plan }) => plan === providerFailure.plan);
  const routeIndex = preparations.findIndex(({ plan }) => plan === routeFailure.plan);

  return providerIndex <= routeIndex ? providerFailure : routeFailure;
};

const collectPlanRouteRuntimes = <TPresentation>(
  plan: RouterTransitionPlan<TPresentation>,
): RouteActivationRuntime<TPresentation>[] => {
  return [
    ...plan.nextRoutes.map((entry) => entry.runtime),
    ...(plan.childPlan ? collectPlanRouteRuntimes(plan.childPlan) : []),
  ];
};

const collectBranchRouteRuntimes = <TPresentation>(
  branch: RouterRuntimeBranch<TPresentation> | null,
): RouteActivationRuntime<TPresentation>[] => {
  if (!branch) {
    return [];
  }

  return [
    ...branch.routes.map((entry) => entry.runtime),
    ...(branch.child ? branch.child.runtime.getActiveRouteRuntimes() : []),
  ];
};

const collectPlanNavigationBlockerBoundaries = <TPresentation>(
  plan: RouterTransitionPlan<TPresentation>,
): readonly NavigationBlockerBoundary[] => {
  const boundaries: NavigationBlockerBoundary[] = [];
  const nextRuntimes = new Set(collectPlanRouteRuntimes(plan));

  for (const current of [...collectPlanPath(plan)].reverse()) {
    const previousTerminal = current.previousBranch?.routes.at(-1)?.runtime ?? null;
    const nextTerminal = current.nextRoutes.at(-1)?.runtime ?? null;

    if (previousTerminal && previousTerminal !== nextTerminal) {
      appendNavigationBlockerBoundary(boundaries, previousTerminal.getNavigationBlockerBoundary());
    }
  }

  for (const runtime of collectBranchRouteRuntimes(plan.previousBranch).reverse()) {
    if (!nextRuntimes.has(runtime)) {
      appendNavigationBlockerBoundary(boundaries, runtime.getNavigationBlockerBoundary());
    }
  }

  return Object.freeze(boundaries);
};

const collectActivationNavigationBlockerBoundaries = <TPresentation>(
  previous: RouterRuntimeActivationNode<TPresentation> | null,
  next: RouterRuntimeActivationNode<TPresentation>,
): readonly NavigationBlockerBoundary[] => {
  if (!previous) return Object.freeze([]);

  const boundaries: NavigationBlockerBoundary[] = [];
  const nextRuntimes = new Set(collectActivationRouteRuntimes(next));
  const nextNodes = new Map(collectActivationNodes(next).map((node) => [node.runtime, node]));

  for (const current of collectActivationNodes(previous).reverse()) {
    const previousTerminal = current.branch?.routes.at(-1)?.runtime ?? null;
    const nextTerminal = nextNodes.get(current.runtime)?.branch?.routes.at(-1)?.runtime ?? null;

    if (previousTerminal && previousTerminal !== nextTerminal) {
      appendNavigationBlockerBoundary(boundaries, previousTerminal.getNavigationBlockerBoundary());
    }
  }

  for (const runtime of collectActivationRouteRuntimes(previous).reverse()) {
    if (!nextRuntimes.has(runtime)) {
      appendNavigationBlockerBoundary(boundaries, runtime.getNavigationBlockerBoundary());
    }
  }

  return Object.freeze(boundaries);
};

const collectActivationNodes = <TPresentation>(
  root: RouterRuntimeActivationNode<TPresentation>,
): RouterRuntimeActivationNode<TPresentation>[] => {
  return [root, ...(root.child ? collectActivationNodes(root.child) : [])];
};

const appendNavigationBlockerBoundary = (
  boundaries: NavigationBlockerBoundary[],
  boundary: NavigationBlockerBoundary,
): void => {
  if (!boundaries.includes(boundary)) boundaries.push(boundary);
};

const createPolicyContext = (
  params: Readonly<Record<string, unknown>>,
  context: RouterRuntimePrepareContext,
  signal: AbortSignal,
): RouteRuntimeContextInterface => ({
  app: context.app,
  params,
  session: context.session,
  signal,
});

const createProviderContext = (scope: RuntimeScope, signal: AbortSignal) => ({
  params: {},
  props: EMPTY_PROPS,
  scope,
  signal,
});

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

const createInterruptedResult = <TPresentation>(reason: unknown): RouterRuntimePrepareResult<TPresentation> => ({
  reason,
  type: 'interrupted',
});

class ActionPolicyDecisionError extends Error {
  constructor(readonly decision: Extract<PolicyBoundaryDecision, { readonly type: 'forbidden' | 'not-found' }>) {
    super(`Controller action отклонён policy-решением ${decision.type}.`);
  }
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw signal.reason ?? new Error('Router transition был прерван.');
  }
};

const assertRuntimeId = (runtimeId: string): void => {
  if (runtimeId.length === 0 || runtimeId.trim() !== runtimeId) {
    throw new Error('Router runtime id должен быть непустым значением без пробелов по краям.');
  }
};

const EMPTY_PARAMS = Object.freeze({});
const EMPTY_PROPS = Object.freeze({});
const CONTINUE_POLICY_DECISION = Object.freeze({ type: 'continue' } as const);
