import React from 'react';

import type {
  ApplicationRouterHistoryEntry,
  ApplicationRouterRuntimeEntry,
} from '../../../../core/application/lifecycle/application';
import { getRouteDefinition } from '../../../../core/router/declaration/route';
import type { NavigationRouteEntry, NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { RouterRuntimeActivationTree } from '../../../../core/router/runtime/router-runtime';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ScreenAnimation } from '../../../screen/declaration/screen-animation';
import type { ScreenPresentation } from '../../../screen/declaration/screen-presentation';
import type { ScreenTransitionOperation } from '../../../screen/declaration/screen-transition';
import { ScreenRenderer } from '../../../screen/rendering/screen-renderer';
import { ScreenRuntime } from '../../../screen/runtime/screen-runtime';
import { getRoutePresentationDefinition } from '../../declaration/route';
import { RouteHost, RouteModuleHost } from '../route-host';
import {
  type NativePendingRouteProjection,
  resolveNativePendingRouteProjection,
  resolveNativeRouteChangeDepth,
  resolveNativeRouteIndexPresentationKey,
  resolveNativeRoutePresentationKey,
} from './native-route-projection.ts';

export interface NativeRouteProjectionInput {
  readonly components: ApplicationComponents;
  readonly current: NavigationState | undefined;
  readonly dismissing: boolean;
  readonly entries: readonly ApplicationRouterHistoryEntry<ModuleMetadata>[];
  readonly pending: NavigationState | null;
  readonly pendingTree: RouterRuntimeActivationTree<ModuleMetadata> | null;
  readonly runtimeEntries: readonly ApplicationRouterRuntimeEntry<ModuleMetadata>[];
  readonly source: NavigationState | undefined;
}

interface NativeScreenTransition {
  readonly animation: ScreenAnimation | undefined;
  readonly depth: number;
  readonly operation: ScreenTransitionOperation;
}

interface OutletProjection {
  readonly components: ApplicationComponents;
  readonly completionDepth: number;
  readonly currentPath: readonly NavigationRouteEntry[];
  readonly depth: number;
  readonly pending: NativePendingRouteProjection | null;
  readonly runtimeEntries: readonly ApplicationRouterRuntimeEntry<ModuleMetadata>[];
  readonly transition: NativeScreenTransition | null;
  readonly tree: RouterRuntimeActivationTree<ModuleMetadata> | null;
  readonly tracksCompletion: boolean;
}

interface CachedSceneContent {
  readonly childRuntime: ScreenRuntime | null;
  readonly components: ApplicationComponents;
  readonly content: React.ReactNode;
  readonly kind: 'index' | 'module' | 'route';
  readonly routeRuntime: RouteActivationRuntime<ModuleMetadata>;
}

/** Projects core routing into stable physical screen identities outside React. */
export class NativeRouteProjectionRuntime {
  readonly root = new ScreenRuntime();

  private readonly content = new Map<string, CachedSceneContent>();
  private readonly outlets = new Map<string, ScreenRuntime>([[ROOT_OUTLET, this.root]]);
  private readonly touchedContent = new Set<string>();
  private readonly touchedOutlets = new Set<string>();
  private completionRuntime: ScreenRuntime = this.root;
  private completionChanged = false;

  constructor(private readonly onPresentationComplete: () => void) {}

  completePresentation = (runtime: ScreenRuntime): void => {
    if (runtime === this.completionRuntime) this.onPresentationComplete();
  };

  project(input: NativeRouteProjectionInput): boolean {
    this.touchedContent.clear();
    this.touchedOutlets.clear();
    this.touchedOutlets.add(ROOT_OUTLET);
    this.completionRuntime = this.root;
    this.completionChanged = false;

    const focusedEntry = input.entries.at(-1) ?? null;
    const current = focusedEntry?.activation.navigation ?? input.current;
    const currentPath = current?.root.path ?? EMPTY_PATH;

    if (input.pending && input.pending.root.path.length === 0) {
      this.completionChanged = this.root.project(
        createFallbackPresentation(ROOT_FALLBACK_KEY, input.components.fallback),
      );
      this.prune();
      return this.awaitsPresentation();
    }

    const pending = resolveNativePendingRouteProjection(current, input.pending);
    const targetPath = pending?.path ?? currentPath;
    const focusedTree = focusedEntry?.tree ?? null;
    const projectedTree = input.pendingTree ?? focusedTree;
    const projectedPending = input.pendingTree ? null : pending;
    const sourcePath = input.source?.root.path ?? currentPath;
    const transitionDepth = resolveNativeRouteChangeDepth(sourcePath, targetPath);
    const transition =
      transitionDepth === null
        ? null
        : Object.freeze({
            ...resolveTransition(sourcePath, targetPath, input.dismissing),
            depth: transitionDepth,
          });

    if (projectedTree === null && projectedPending === null) {
      this.completionChanged = this.root.project(
        createFallbackPresentation(ROOT_FALLBACK_KEY, input.components.fallback),
      );
      this.prune();
      return this.awaitsPresentation();
    }

    this.projectOutlet(ROOT_OUTLET, {
      components: input.components,
      completionDepth: transitionDepth ?? Math.max(targetPath.length - 1, 0),
      currentPath: targetPath,
      depth: 0,
      pending: projectedPending,
      runtimeEntries: input.runtimeEntries,
      transition,
      tree: projectedTree,
      tracksCompletion: true,
    });
    this.prune();
    return this.awaitsPresentation();
  }

  private projectOutlet(outletKey: string, projection: OutletProjection): ScreenRuntime {
    const runtime = this.resolveOutlet(outletKey);
    const pendingAtOutlet = projection.pending?.changeDepth === projection.depth ? projection.pending : null;
    const target = pendingAtOutlet
      ? this.createPendingPresentation(projection.components, pendingAtOutlet, projection.depth, projection.tree)
      : this.createCommittedPresentation(projection, projection.currentPath, projection.tree);
    const transition =
      target && projection.transition?.depth === projection.depth && projection.transition.animation
        ? Object.freeze({
            animation: projection.transition.animation,
            operation: projection.transition.operation,
          })
        : undefined;
    const presentation = target ? Object.freeze({ ...target, transition }) : null;
    const retained = this.createRetainedPresentations(projection, presentation?.key ?? null);

    const changed = runtime.project(presentation, retained);

    if (projection.tracksCompletion && projection.completionDepth === projection.depth) {
      this.completionRuntime = runtime;
      this.completionChanged = this.completionChanged || changed;
    }
    return runtime;
  }

  private createCommittedPresentation(
    projection: OutletProjection,
    path: readonly NavigationRouteEntry[],
    tree: RouterRuntimeActivationTree<ModuleMetadata> | null,
  ): ScreenPresentation | null {
    const entry = path[projection.depth] ?? null;
    const routeRuntime = tree?.routes[projection.depth] ?? null;

    if (entry && routeRuntime && tree) {
      if (entry.route !== routeRuntime.route) {
        throw new Error(
          `Core navigation path и runtime tree расходятся на depth=${projection.depth}: ` +
            `${describeRoute(entry.route)} !== ${describeRoute(routeRuntime.route)}.`,
        );
      }

      const key = resolveNativeRoutePresentationKey(entry, projection.depth);
      const definition = getRoutePresentationDefinition(routeRuntime.route);
      const resolvedComponents = inheritRouteComponents(projection.components, definition);
      const previous = this.content.get(key);
      const components = sameComponents(previous?.components, resolvedComponents)
        ? previous.components
        : resolvedComponents;
      const route = getRouteDefinition(routeRuntime.route);
      const childRuntime =
        route.routes.length > 0
          ? this.projectOutlet(createChildOutletKey(key), {
              ...projection,
              components,
              currentPath: path,
              depth: projection.depth + 1,
              tree,
            })
          : null;
      const kind = route.routes.length > 0 ? 'route' : 'module';
      const content = this.resolveContent(key, {
        childRuntime,
        components,
        kind,
        routeRuntime,
      });

      return Object.freeze({ content, key });
    }

    if (!entry && !routeRuntime && tree && projection.depth > 0) {
      const ownerEntry = path[projection.depth - 1];
      const ownerRuntime = tree.routes[projection.depth - 1];

      if (!ownerEntry || !ownerRuntime || ownerEntry.route !== ownerRuntime.route) {
        throw new Error('Index screen не имеет согласованного Route owner.');
      }

      const key = resolveNativeRouteIndexPresentationKey(ownerEntry, projection.depth);
      const content = this.resolveContent(key, {
        childRuntime: null,
        components: projection.components,
        kind: 'index',
        routeRuntime: ownerRuntime,
      });

      return Object.freeze({ content, key });
    }

    if (!entry && !routeRuntime) return null;
    throw new Error('Core navigation path и focused runtime tree имеют разную глубину.');
  }

  private createPendingPresentation(
    components: ApplicationComponents,
    pending: NativePendingRouteProjection,
    depth: number,
    tree: RouterRuntimeActivationTree<ModuleMetadata> | null,
  ): ScreenPresentation {
    const entry = pending.path[depth];

    if (!entry) {
      const owner = pending.path[depth - 1];
      const ownerRuntime = tree?.routes[depth - 1];

      if (!owner || !ownerRuntime || owner.route !== ownerRuntime.route) {
        throw new Error('Pending index screen не имеет согласованного Route owner.');
      }

      const key = resolveNativeRouteIndexPresentationKey(owner, depth);
      const content = this.resolveContent(key, {
        childRuntime: null,
        components,
        kind: 'index',
        routeRuntime: ownerRuntime,
      });

      return Object.freeze({ content, key });
    }

    return createFallbackPresentation(resolveNativeRoutePresentationKey(entry, depth), components.fallback);
  }

  private createRetainedPresentations(
    projection: OutletProjection,
    currentKey: string | null,
  ): readonly ScreenPresentation[] {
    const presentations = new Map<string, ScreenPresentation>();

    for (let index = projection.runtimeEntries.length - 1; index >= 0; index -= 1) {
      const runtimeEntry = projection.runtimeEntries[index];

      if (!runtimeEntry) continue;

      const path = runtimeEntry.activation.navigation.root.path;

      if (!hasSameOutletAncestry(path, projection.currentPath, projection.depth)) continue;

      const candidateKey = resolvePathPresentationKey(path, projection.depth);

      if (!candidateKey || candidateKey === currentKey || presentations.has(candidateKey)) continue;

      const presentation = this.createCommittedPresentation(
        {
          ...projection,
          currentPath: path,
          pending: null,
          tracksCompletion: false,
          transition: null,
        },
        path,
        runtimeEntry.tree,
      );

      if (!presentation) continue;
      presentations.set(presentation.key, presentation);
    }

    return Object.freeze([...presentations.values()]);
  }

  private resolveContent(key: string, input: Omit<CachedSceneContent, 'content'>): React.ReactNode {
    this.touchedContent.add(key);
    const current = this.content.get(key);

    if (
      current &&
      current.childRuntime === input.childRuntime &&
      current.components === input.components &&
      current.kind === input.kind &&
      current.routeRuntime === input.routeRuntime
    ) {
      return current.content;
    }

    const child = input.childRuntime ? (
      <ScreenRenderer onPresentationComplete={this.completePresentation} runtime={input.childRuntime} />
    ) : (
      <RouteModuleHost components={input.components} runtime={input.routeRuntime} />
    );
    const content =
      input.kind === 'index' ? (
        child
      ) : (
        <RouteHost
          components={input.components}
          layouts={getRoutePresentationDefinition(input.routeRuntime.route).layouts}
          runtime={input.routeRuntime}
        >
          {child}
        </RouteHost>
      );

    this.content.set(key, Object.freeze({ ...input, content }));
    return content;
  }

  private resolveOutlet(key: string): ScreenRuntime {
    this.touchedOutlets.add(key);
    const current = this.outlets.get(key);

    if (current) return current;

    const runtime = new ScreenRuntime();
    this.outlets.set(key, runtime);
    return runtime;
  }

  private prune(): void {
    for (const key of this.outlets.keys()) {
      if (key !== ROOT_OUTLET && !this.touchedOutlets.has(key)) this.outlets.delete(key);
    }

    for (const key of this.content.keys()) {
      if (!this.touchedContent.has(key)) this.content.delete(key);
    }
  }

  private awaitsPresentation(): boolean {
    return this.completionChanged || this.completionRuntime.getSnapshot().machine.phase === 'transitioning';
  }
}

const createFallbackPresentation = (key: string, content: React.ReactNode): ScreenPresentation => {
  return Object.freeze({ content: content ?? null, key });
};

const describeRoute = (route: Parameters<typeof getRouteDefinition>[0]): string => {
  const token = getRouteDefinition(route).token;

  if (typeof token === 'function' && token.name) return token.name;
  return token ? String(token) : '<structural-route>';
};

const createChildOutletKey = (parentPresentationKey: string): string => `${parentPresentationKey}:outlet`;

const hasSameOutletAncestry = (
  candidate: readonly NavigationRouteEntry[],
  current: readonly NavigationRouteEntry[],
  depth: number,
): boolean => {
  if (candidate.length < depth || current.length < depth) return false;

  for (let index = 0; index < depth; index += 1) {
    const candidateEntry = candidate[index];
    const currentEntry = current[index];

    if (
      !candidateEntry ||
      !currentEntry ||
      resolveNativeRoutePresentationKey(candidateEntry, index) !==
        resolveNativeRoutePresentationKey(currentEntry, index)
    ) {
      return false;
    }
  }

  return true;
};

const resolvePathPresentationKey = (path: readonly NavigationRouteEntry[], depth: number): string | null => {
  const entry = path[depth];

  if (entry) return resolveNativeRoutePresentationKey(entry, depth);
  if (depth === 0) return null;

  const owner = path[depth - 1];
  return owner ? resolveNativeRouteIndexPresentationKey(owner, depth) : null;
};

const inheritRouteComponents = (
  components: ApplicationComponents,
  definition: ReturnType<typeof getRoutePresentationDefinition>,
): ApplicationComponents => {
  if (
    definition.exception === undefined &&
    definition.fallback === undefined &&
    definition.forbidden === undefined &&
    definition.notFound === undefined
  ) {
    return components;
  }

  return Object.freeze({
    ...components,
    exception: definition.exception ?? components.exception,
    fallback: definition.fallback ?? components.fallback,
    forbidden: definition.forbidden ?? components.forbidden,
    notFound: definition.notFound ?? components.notFound,
  });
};

const sameComponents = (
  left: ApplicationComponents | undefined,
  right: ApplicationComponents,
): left is ApplicationComponents => {
  return (
    left !== undefined &&
    left.exception === right.exception &&
    left.failed === right.failed &&
    left.fallback === right.fallback &&
    left.forbidden === right.forbidden &&
    left.notFound === right.notFound &&
    left.splash === right.splash
  );
};

const resolveTransition = (
  sourcePath: readonly NavigationRouteEntry[],
  targetPath: readonly NavigationRouteEntry[],
  dismissing: boolean,
): Omit<NativeScreenTransition, 'depth'> => {
  if (dismissing) {
    return Object.freeze({
      animation: reverseScreenAnimation(resolveTerminalAnimation(sourcePath)),
      operation: 'dismiss',
    });
  }

  const entering = resolveTerminalAnimation(targetPath);

  if (entering) return Object.freeze({ animation: entering, operation: 'present' });

  return Object.freeze({
    animation: reverseScreenAnimation(resolveTerminalAnimation(sourcePath)),
    operation: 'dismiss',
  });
};

const resolveTerminalAnimation = (path: readonly NavigationRouteEntry[]): ScreenAnimation | undefined => {
  const terminal = path.at(-1);
  return terminal ? getRoutePresentationDefinition(terminal.route).animation : undefined;
};

const reverseScreenAnimation = (animation: ScreenAnimation | undefined): ScreenAnimation | undefined => {
  switch (animation) {
    case ScreenAnimation.Fade:
      return ScreenAnimation.Fade;
    case ScreenAnimation.SlideFromLeft:
      return ScreenAnimation.SlideFromRight;
    case ScreenAnimation.SlideFromRight:
      return ScreenAnimation.SlideFromLeft;
    default:
      return undefined;
  }
};

const ROOT_FALLBACK_KEY = 'native-root-fallback';
const ROOT_OUTLET = 'root';
const EMPTY_PATH: readonly NavigationRouteEntry[] = Object.freeze([]);
