import type {
  ApplicationNavigationListener,
  ApplicationNavigationSnapshot,
  ApplicationRouterHistoryEntry,
  ApplicationRouterRuntimeEntry,
} from '../../../../core/application/lifecycle/application';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { NativeRouterBridge } from '../../bridge/native-router-bridge';
import { getRouterPresentationDefinition } from '../../declaration/router';
import {
  NativeRouteProjectionRuntime,
  type NativeRouteProjectionInput,
} from '../../rendering/native-navigation-host/native-route-projection-runtime.tsx';
import { resolveNativeFrameTransition, type NativeFrameTransition } from '../../rendering/presentation-cycle';

type NativePresentationParticipant = 'frame' | 'screen';
type NativePresentationListener = () => void;

interface NativePresentationCycleState {
  readonly completed: Set<NativePresentationParticipant>;
  readonly requiresFrame: boolean;
  readonly revision: number;
  screenRegistered: boolean;
}

export interface NativePresentationSource {
  readonly components: ApplicationComponents;
  readonly getHistoryEntries: () => readonly ApplicationRouterHistoryEntry<ModuleMetadata>[];
  readonly getNavigation: () => ApplicationNavigationSnapshot;
  readonly getRouterRuntime: () => RouterRuntime<ModuleMetadata>;
  readonly getRuntimeEntries: () => readonly ApplicationRouterRuntimeEntry<ModuleMetadata>[];
  readonly routerBridge: NativeRouterBridge;
  readonly subscribeNavigation: (listener: ApplicationNavigationListener) => () => void;
}

export interface NativeFramePresentationSnapshot {
  readonly application: ApplicationNavigationSnapshot;
  readonly transition: NativeFrameTransition | null;
}

export class NativePresentationRuntime {
  readonly routes = new NativeRouteProjectionRuntime(() => this.complete('screen'));

  private cycle: NativePresentationCycleState | null = null;
  private readonly frameListeners = new Set<NativePresentationListener>();
  private frameSnapshot: NativeFramePresentationSnapshot | null = null;
  private readonly navigationListeners = new Set<NativePresentationListener>();
  private navigationSnapshot: ApplicationNavigationSnapshot;
  private resolvedComponents: ApplicationComponents | null = null;
  private resolvedComponentsRouter: object | null = null;
  private readonly unsubscribeBridge: () => void;
  private readonly unsubscribeNavigation: () => void;

  constructor(private readonly source: NativePresentationSource) {
    const application = source.getNavigation();
    this.navigationSnapshot = createNavigationSnapshot(application);
    this.unsubscribeBridge = source.routerBridge.subscribe(this.synchronize);
    this.unsubscribeNavigation = source.subscribeNavigation(this.synchronize);
    this.synchronize();
  }

  completeFrame = (): void => this.complete('frame');

  getFrameSnapshot = (): NativeFramePresentationSnapshot | null => this.frameSnapshot;

  getNavigationSnapshot = (): ApplicationNavigationSnapshot => this.navigationSnapshot;

  subscribeFrame = (listener: NativePresentationListener): (() => void) => {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  };

  subscribeNavigation = (listener: NativePresentationListener): (() => void) => {
    this.navigationListeners.add(listener);
    return () => this.navigationListeners.delete(listener);
  };

  dispose(): void {
    this.unsubscribeBridge();
    this.unsubscribeNavigation();
    this.frameListeners.clear();
    this.navigationListeners.clear();
  }

  private readonly synchronize = (): void => {
    const application = this.source.getNavigation();
    const navigation = this.source.routerBridge.getSnapshot();
    const revision = this.source.routerBridge.getPendingPresentationRevision();
    const source = this.source.routerBridge.getPresentedNavigation() ?? application.navigation;
    const target = application.pending ?? (revision === null ? null : (application.navigation ?? null));
    const resolvedFrame = resolveNativeFrameTransition(source, target, revision);
    const frame = sameFrameTransition(this.frameSnapshot?.transition ?? null, resolvedFrame)
      ? (this.frameSnapshot?.transition ?? null)
      : resolvedFrame;

    if (revision !== null && this.cycle?.revision !== revision) {
      this.cycle = {
        completed: new Set(),
        requiresFrame: frame !== null,
        revision,
        screenRegistered: false,
      };
    }

    if (application.navigation || application.pending) {
      const runtime = this.source.getRouterRuntime();
      const pendingActivation = application.pending ? runtime.findActivation(application.pending) : null;
      const input: NativeRouteProjectionInput = {
        components: this.resolveComponents(runtime),
        current: application.navigation,
        dismissing: navigation.backInProgress || (!application.pending && navigation.action === 'pop'),
        entries: this.source.getHistoryEntries(),
        pending: application.pending,
        pendingTree: pendingActivation?.getTreeSnapshot() ?? null,
        runtimeEntries: this.source.getRuntimeEntries(),
        source,
      };

      const awaitsScreen = this.routes.project(input);

      if (revision !== null && this.cycle?.revision === revision && !this.cycle.screenRegistered) {
        this.cycle.screenRegistered = true;
        if (!awaitsScreen) this.complete('screen');
      }
    }

    this.publishNavigation(application);
    this.publishFrame(frame);
  };

  private complete(participant: NativePresentationParticipant): void {
    const cycle = this.cycle;

    if (!cycle) return;

    cycle.completed.add(participant);

    if (!cycle.completed.has('screen') || (cycle.requiresFrame && !cycle.completed.has('frame'))) return;

    this.source.routerBridge.completePresentation(cycle.revision);
    this.cycle = null;
  }

  private publishFrame(transition: NativeFrameTransition | null): void {
    const application = this.navigationSnapshot;
    const relevant =
      transition !== null ||
      hasNestedRouter(application.navigation?.root) ||
      hasNestedRouter(application.pending?.root);
    const next = relevant ? Object.freeze({ application, transition }) : null;

    if (
      this.frameSnapshot === next ||
      (this.frameSnapshot?.application === next?.application && this.frameSnapshot?.transition === next?.transition)
    ) {
      return;
    }

    this.frameSnapshot = next;
    for (const listener of this.frameListeners) listener();
  }

  private publishNavigation(application: ApplicationNavigationSnapshot): void {
    if (sameNavigationSnapshot(this.navigationSnapshot, application)) return;

    this.navigationSnapshot = createNavigationSnapshot(application);
    for (const listener of this.navigationListeners) listener();
  }

  private resolveComponents(runtime: RouterRuntime<ModuleMetadata>): ApplicationComponents {
    if (this.resolvedComponents && this.resolvedComponentsRouter === runtime.router) {
      return this.resolvedComponents;
    }

    const definition = getRouterPresentationDefinition(runtime.router);

    this.resolvedComponents = Object.freeze({
      exception: definition.exception ?? this.source.components.exception,
      failed: this.source.components.failed,
      fallback: definition.fallback ?? this.source.components.fallback,
      forbidden: definition.forbidden ?? this.source.components.forbidden,
      notFound: definition.notFound ?? this.source.components.notFound,
      splash: this.source.components.splash,
    });
    this.resolvedComponentsRouter = runtime.router;
    return this.resolvedComponents;
  }
}

const sameFrameTransition = (left: NativeFrameTransition | null, right: NativeFrameTransition | null): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;

  return left.depth === right.depth && left.operation === right.operation && left.revision === right.revision;
};

const createNavigationSnapshot = (snapshot: ApplicationNavigationSnapshot): ApplicationNavigationSnapshot =>
  Object.freeze({
    decision: snapshot.decision,
    navigation: snapshot.navigation,
    pending: snapshot.pending,
  });

const sameNavigationSnapshot = (left: ApplicationNavigationSnapshot, right: ApplicationNavigationSnapshot): boolean =>
  left.decision === right.decision && left.navigation === right.navigation && left.pending === right.pending;

const hasNestedRouter = (state: NavigationState['root'] | null | undefined): boolean => state?.child != null;
