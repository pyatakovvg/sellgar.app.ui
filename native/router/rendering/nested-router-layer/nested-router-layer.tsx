import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApplicationNavigationDecision } from '../../../../core/application/lifecycle/application';
import type { RouteDeclaration } from '../../../../core/router/declaration/route';
import type { RouterDeclaration } from '../../../../core/router/declaration/router';
import type { NavigationRouterState } from '../../../../core/router/runtime/navigation-state';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type {
  ActiveChildRouterRuntime,
  RouterRuntime,
  RouterRuntimeActivationChild,
  RouterRuntimeActivationTree,
} from '../../../../core/router/runtime/router-runtime';
import type {
  ApplicationComponents,
  ResolvedApplicationRouting,
} from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ScreenLayerHost } from '../../../screen/rendering/screen-compositor';
import { getRoutePresentationDefinition } from '../../declaration/route';
import { getRouterPresentationDefinition } from '../../declaration/router';
import { NestedRouterHost } from '../router-host/nested-router-host';
import { RouterHost } from '../router-host';
import type { NativeFrameTransition } from '../presentation-cycle';

interface IProps {
  readonly components: ApplicationComponents;
  readonly decision?: ApplicationNavigationDecision | null;
  readonly depth: number;
  readonly dismissPending: () => void | Promise<void>;
  readonly onPresentationComplete: () => void;
  readonly pending?: NavigationRouterState | null;
  readonly retainedTree?: RouterRuntimeActivationTree<ModuleMetadata>;
  readonly routing: ResolvedApplicationRouting | null;
  readonly runtime: RouterRuntime<ModuleMetadata>;
  readonly transition: NativeFrameTransition | null;
  readonly tree?: RouterRuntimeActivationTree<ModuleMetadata>;
}

export const NestedRouterLayer: React.FC<IProps> = (props) => {
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
  );
  const resolvedSnapshot = props.tree?.snapshot ?? snapshot;

  const unavailable =
    props.decision?.type === 'forbidden' ||
    props.decision?.type === 'not-found' ||
    resolvedSnapshot.phase === 'forbidden' ||
    resolvedSnapshot.phase === 'not-found' ||
    resolvedSnapshot.phase === 'failed';

  const branch = props.tree
    ? { child: props.tree.child, routes: props.tree.routes }
    : props.runtime.getBranchSnapshot();
  const activeChild = unavailable ? null : branch.child;
  const pending = props.pending ?? null;
  const pendingChild = pending?.child ?? null;
  const childPending = 'childPending' in branch && branch.childPending;
  const target =
    childPending && pending && pendingChild
      ? createPendingNestedRouterTarget(props, pending, pendingChild)
      : activeChild
        ? createNestedRouterTarget(props, branch.routes, activeChild, childPending)
        : null;
  const retainedChild = props.retainedTree?.child ?? null;
  const retainedTarget = retainedChild
    ? createNestedRouterTarget(props, props.retainedTree?.routes ?? [], retainedChild, false)
    : null;

  return (
    <FramePresentation
      depth={props.depth}
      dismissPending={props.dismissPending}
      onPresentationComplete={props.onPresentationComplete}
      pending={pendingChild}
      retainedTarget={retainedTarget}
      target={target}
      transition={props.transition}
    />
  );
};

interface NestedRouterTarget {
  readonly childPending: boolean;
  readonly components: ApplicationComponents;
  readonly owner: RouteDeclaration;
  readonly routing: ResolvedApplicationRouting | null;
  readonly router: RouterDeclaration;
  readonly runtime: RouterRuntime<ModuleMetadata> | null;
  readonly tree: RouterRuntimeActivationTree<ModuleMetadata> | undefined;
}

interface FramePresentationProps {
  readonly depth: number;
  readonly dismissPending: () => void | Promise<void>;
  readonly onPresentationComplete: () => void;
  readonly pending: NavigationRouterState | null;
  readonly retainedTarget: NestedRouterTarget | null;
  readonly target: NestedRouterTarget | null;
  readonly transition: NativeFrameTransition | null;
}

interface FramePresentationState {
  readonly completedRevision: number | null;
  readonly next: NestedRouterTarget | null;
  readonly operation: NativeFrameTransition['operation'] | null;
  readonly phase: 'dismissing' | 'hidden' | 'presenting' | 'visible';
  readonly revision: number | null;
  readonly target: NestedRouterTarget | null;
}

const FramePresentation: React.FC<FramePresentationProps> = (props) => {
  const localTransition = props.transition?.depth === props.depth ? props.transition : null;
  const [state, setState] = React.useState<FramePresentationState>(() => ({
    completedRevision: null,
    next: null,
    operation: localTransition?.operation ?? null,
    phase:
      localTransition?.operation === 'present'
        ? 'presenting'
        : localTransition?.operation === 'dismiss' || localTransition?.operation === 'replace'
          ? 'dismissing'
          : props.target
            ? 'visible'
            : 'hidden',
    revision: localTransition?.revision ?? null,
    target:
      localTransition?.operation === 'dismiss' || localTransition?.operation === 'replace'
        ? props.retainedTarget
        : props.target,
  }));
  React.useLayoutEffect(() => {
    setState((current) => reconcileFramePresentation(current, props.target, props.retainedTarget, localTransition));
  }, [localTransition, props.retainedTarget, props.target]);
  const reportedRevision = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (state.completedRevision === null || reportedRevision.current === state.completedRevision) return;

    reportedRevision.current = state.completedRevision;
    props.onPresentationComplete();
  }, [props.onPresentationComplete, state.completedRevision]);

  const handlePresentationComplete = React.useCallback(() => {
    setState((current) => {
      if (current.phase === 'dismissing' && current.next) {
        return {
          completedRevision: null,
          next: null,
          operation: current.operation,
          phase: 'presenting',
          revision: current.revision,
          target: current.next,
        };
      }

      if (current.phase === 'dismissing') {
        return {
          ...current,
          completedRevision: current.revision,
          next: null,
          phase: 'hidden',
          target: null,
        };
      }

      return {
        ...current,
        completedRevision: current.revision,
        next: null,
        phase: 'visible',
      };
    });
  }, []);
  const content = React.useMemo<React.ReactNode>(() => {
    const target = state.target;

    if (!target) return null;

    return (
      <NestedRouterHost
        dismissPending={props.dismissPending}
        exception={target.components.exception}
        onPresentationComplete={handlePresentationComplete}
        phase={state.phase}
        router={target.router}
        routing={target.routing}
        runtime={target.runtime}
      >
        {target.runtime ? (
          <>
            <RouterHost
              components={target.components}
              pending={target.childPending}
              runtime={target.runtime}
              tree={target.tree}
            />
            {target.childPending ? null : (
              <NestedRouterLayer
                components={target.components}
                depth={props.depth + 1}
                dismissPending={props.dismissPending}
                onPresentationComplete={props.onPresentationComplete}
                pending={props.pending}
                retainedTree={props.retainedTarget?.tree}
                routing={target.routing}
                runtime={target.runtime}
                transition={props.transition}
                tree={target.tree}
              />
            )}
          </>
        ) : (
          target.components.fallback
        )}
      </NestedRouterHost>
    );
  }, [
    handlePresentationComplete,
    props.depth,
    props.dismissPending,
    props.onPresentationComplete,
    props.pending,
    props.retainedTarget?.tree,
    props.transition,
    state.phase,
    state.revision,
    state.target,
  ]);

  if (!content) return null;

  return (
    <View
      pointerEvents={
        state.phase === 'hidden'
          ? 'none'
          : state.phase === 'presenting' || state.phase === 'visible'
            ? 'box-none'
            : 'box-only'
      }
      style={StyleSheet.absoluteFill}
    >
      <ScreenLayerHost depth={props.depth} kind="frame">
        <View style={StyleSheet.absoluteFill}>{content}</View>
      </ScreenLayerHost>
    </View>
  );
};

const reconcileFramePresentation = (
  current: FramePresentationState,
  target: NestedRouterTarget | null,
  retainedTarget: NestedRouterTarget | null,
  transition: NativeFrameTransition | null,
): FramePresentationState => {
  if (!transition) {
    return reconcileStableFramePresentation(current, target);
  }

  if (matchesFrameTransition(current, target, retainedTarget, transition)) {
    return reconcileCurrentFrameTransition(current, target, retainedTarget, transition);
  }

  switch (transition.operation) {
    case 'dismiss':
      return {
        completedRevision: null,
        next: null,
        operation: transition.operation,
        phase: 'dismissing',
        revision: transition.revision,
        target: current.target ?? retainedTarget,
      };
    case 'present':
      return {
        completedRevision: null,
        next: null,
        operation: transition.operation,
        phase: 'presenting',
        revision: transition.revision,
        target,
      };
    case 'replace':
      return current.target
        ? {
            completedRevision: null,
            next: target,
            operation: transition.operation,
            phase: 'dismissing',
            revision: transition.revision,
            target: current.target,
          }
        : retainedTarget
          ? {
              completedRevision: null,
              next: target,
              operation: transition.operation,
              phase: 'dismissing',
              revision: transition.revision,
              target: retainedTarget,
            }
          : {
              completedRevision: null,
              next: null,
              operation: transition.operation,
              phase: 'presenting',
              revision: transition.revision,
              target,
            };
  }
};

const reconcileStableFramePresentation = (
  current: FramePresentationState,
  target: NestedRouterTarget | null,
): FramePresentationState => {
  if (current.operation !== null && current.revision === null) {
    return restoreCommittedFramePresentation(current, target);
  }

  if (current.phase === 'hidden') {
    return target
      ? {
          completedRevision: null,
          next: null,
          operation: null,
          phase: 'presenting',
          revision: null,
          target,
        }
      : current.target
        ? { ...current, completedRevision: null, operation: null, revision: null, target: null }
        : current;
  }

  if (current.phase !== 'visible') return current;

  if (!target) {
    return {
      completedRevision: null,
      next: null,
      operation: null,
      phase: 'dismissing',
      revision: null,
      target: current.target,
    };
  }

  if (!sameFrameTarget(current.target, target)) return current;

  if (
    current.target === target &&
    current.operation === null &&
    current.revision === null &&
    current.completedRevision === null
  ) {
    return current;
  }

  return {
    ...current,
    completedRevision: null,
    operation: null,
    revision: null,
    target,
  };
};

const restoreCommittedFramePresentation = (
  current: FramePresentationState,
  target: NestedRouterTarget | null,
): FramePresentationState => {
  if (sameFrameTarget(current.target, target)) {
    if (current.phase === 'visible') {
      return { ...current, completedRevision: null, operation: null, revision: null, target };
    }

    return {
      completedRevision: null,
      next: null,
      operation: null,
      phase: 'presenting',
      revision: null,
      target,
    };
  }

  if (!current.target) {
    return target
      ? {
          completedRevision: null,
          next: null,
          operation: null,
          phase: 'presenting',
          revision: null,
          target,
        }
      : { ...current, completedRevision: null, operation: null, revision: null };
  }

  return {
    completedRevision: null,
    next: target,
    operation: null,
    phase: 'dismissing',
    revision: null,
    target: current.target,
  };
};

const matchesFrameTransition = (
  current: FramePresentationState,
  target: NestedRouterTarget | null,
  retainedTarget: NestedRouterTarget | null,
  transition: NativeFrameTransition,
): boolean => {
  if (current.operation !== transition.operation) return false;

  if (current.revision === null && transition.revision !== null) {
    return true;
  }

  if (current.revision !== transition.revision) return false;

  switch (transition.operation) {
    case 'dismiss':
      if (current.phase === 'hidden') return true;
      return sameFrameTarget(current.target, retainedTarget ?? current.target);
    case 'present':
      return current.target === null || target === null || sameFrameTarget(current.target, target);
    case 'replace': {
      const destination =
        current.next ?? (current.phase === 'presenting' || current.phase === 'visible' ? current.target : null);

      return destination === null || target === null || sameFrameTarget(destination, target);
    }
  }
};

const reconcileCurrentFrameTransition = (
  current: FramePresentationState,
  target: NestedRouterTarget | null,
  retainedTarget: NestedRouterTarget | null,
  transition: NativeFrameTransition,
): FramePresentationState => {
  const revisionChanged = current.revision !== transition.revision;
  const transitionFinished =
    (transition.operation === 'dismiss' && current.phase === 'hidden') ||
    (transition.operation !== 'dismiss' && current.phase === 'visible');
  const completedRevision =
    revisionChanged && transition.revision !== null && transitionFinished
      ? transition.revision
      : current.completedRevision;

  switch (transition.operation) {
    case 'dismiss':
      return {
        ...current,
        completedRevision,
        revision: transition.revision,
        target: current.phase === 'hidden' ? null : (current.target ?? retainedTarget),
      };
    case 'present':
      return {
        ...current,
        completedRevision,
        revision: transition.revision,
        target: target ?? current.target,
      };
    case 'replace':
      return {
        ...current,
        completedRevision,
        next: current.phase === 'dismissing' ? (target ?? current.next) : null,
        revision: transition.revision,
        target: current.phase === 'dismissing' ? current.target : (target ?? current.target),
      };
  }
};

const sameFrameTarget = (left: NestedRouterTarget | null, right: NestedRouterTarget | null): boolean =>
  left?.owner === right?.owner && left?.router === right?.router;

const createNestedRouterTarget = (
  props: IProps,
  routes: readonly RouteActivationRuntime<ModuleMetadata>[],
  activeChild: ActiveChildRouterRuntime<ModuleMetadata> | RouterRuntimeActivationChild<ModuleMetadata>,
  childPending: boolean,
): NestedRouterTarget | null => {
  const components = resolveNestedComponents(props, routes, activeChild.owner);

  if (!components) return null;

  return Object.freeze({
    childPending,
    components,
    owner: activeChild.owner.route,
    routing: props.routing,
    router: 'tree' in activeChild ? activeChild.tree.runtime.router : activeChild.runtime.router,
    runtime: 'tree' in activeChild ? activeChild.tree.runtime : activeChild.runtime,
    tree: 'tree' in activeChild ? activeChild.tree : undefined,
  });
};

const createPendingNestedRouterTarget = (
  props: IProps,
  parent: NavigationRouterState,
  child: NavigationRouterState,
): NestedRouterTarget | null => {
  const owner = child.owner;

  if (!owner) {
    throw new Error('Pending nested Router не имеет Route owner.');
  }

  const components = resolvePendingNestedComponents(props, parent, owner);

  if (!components) return null;

  return Object.freeze({
    childPending: true,
    components,
    owner,
    router: child.router,
    routing: props.routing,
    runtime: null,
    tree: undefined,
  });
};

const resolveNestedComponents = (
  props: IProps,
  routes: readonly RouteActivationRuntime<ModuleMetadata>[],
  owner: RouteActivationRuntime<ModuleMetadata>,
): ApplicationComponents | null => {
  const parent = resolveOwnerComponents(props.runtime, props.components, routes, owner);

  if (!parent) {
    return null;
  }

  return {
    exception: props.routing?.exception ?? parent.exception,
    fallback: props.routing?.fallback ?? parent.fallback,
    forbidden: props.routing?.forbidden ?? parent.forbidden,
    notFound: props.routing?.notFound ?? parent.notFound,
  };
};

const resolvePendingNestedComponents = (
  props: IProps,
  parent: NavigationRouterState,
  owner: RouteDeclaration,
): ApplicationComponents | null => {
  const inherited = resolveNavigationOwnerComponents(props.components, parent, owner);

  if (!inherited) return null;

  return {
    exception: props.routing?.exception ?? inherited.exception,
    fallback: props.routing?.fallback ?? inherited.fallback,
    forbidden: props.routing?.forbidden ?? inherited.forbidden,
    notFound: props.routing?.notFound ?? inherited.notFound,
  };
};

const resolveNavigationOwnerComponents = (
  inherited: ApplicationComponents,
  parent: NavigationRouterState,
  owner: RouteDeclaration,
): ApplicationComponents | null => {
  const router = getRouterPresentationDefinition(parent.router);
  let components: ApplicationComponents = {
    exception: router.exception ?? inherited.exception,
    fallback: router.fallback ?? inherited.fallback,
    forbidden: router.forbidden ?? inherited.forbidden,
    notFound: router.notFound ?? inherited.notFound,
  };

  for (const entry of parent.path) {
    const definition = getRoutePresentationDefinition(entry.route);

    components = {
      exception: definition.exception ?? components.exception,
      fallback: definition.fallback ?? components.fallback,
      forbidden: definition.forbidden ?? components.forbidden,
      notFound: definition.notFound ?? components.notFound,
    };

    if (entry.route === owner) return components;
  }

  throw new Error('Owner pending nested Router отсутствует в navigation path родительского Router.');
};

const resolveOwnerComponents = (
  runtime: RouterRuntime<ModuleMetadata>,
  inherited: ApplicationComponents,
  routes: readonly RouteActivationRuntime<ModuleMetadata>[],
  owner: RouteActivationRuntime<ModuleMetadata>,
): ApplicationComponents | null => {
  const router = getRouterPresentationDefinition(runtime.router);
  let components: ApplicationComponents = {
    exception: router.exception ?? inherited.exception,
    fallback: router.fallback ?? inherited.fallback,
    forbidden: router.forbidden ?? inherited.forbidden,
    notFound: router.notFound ?? inherited.notFound,
  };
  if (!routes.includes(owner)) {
    throw new Error('Owner nested Router отсутствует в RouteRuntime path текущей ветки.');
  }

  for (const route of routes) {
    const definition = getRoutePresentationDefinition(route.route);

    components = {
      exception: definition.exception ?? components.exception,
      fallback: definition.fallback ?? components.fallback,
      forbidden: definition.forbidden ?? components.forbidden,
      notFound: definition.notFound ?? components.notFound,
    };

    if (route === owner) {
      return components;
    }
  }

  return null;
};
