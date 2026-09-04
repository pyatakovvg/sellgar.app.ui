import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApplicationNavigationDecision } from '../../../../core/application/lifecycle/application';
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
import type { ScreenPresentation } from '../../../screen/declaration/screen-presentation';
import { ScreenLayerHost } from '../../../screen/rendering/screen-compositor';
import { ScreenRenderer } from '../../../screen/rendering/screen-renderer';
import { getRoutePresentationDefinition } from '../../declaration/route';
import { getRouterPresentationDefinition } from '../../declaration/router';
import { NestedRouterHost } from '../router-host/nested-router-host';
import { RouterHost } from '../router-host';
import type { NativeFrameTransition } from '../presentation-cycle';

interface IProps {
  readonly components: ApplicationComponents;
  readonly decision?: ApplicationNavigationDecision | null;
  readonly depth: number;
  readonly onPresentationComplete: () => void;
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
  const target = activeChild
    ? createNestedRouterTarget(
        props,
        branch.routes,
        activeChild,
        'childPending' in branch ? branch.childPending : false,
      )
    : null;
  const retainedChild = props.retainedTree?.child ?? null;
  const retainedTarget = retainedChild
    ? createNestedRouterTarget(props, props.retainedTree?.routes ?? [], retainedChild, false)
    : null;

  return (
    <FramePresentation
      depth={props.depth}
      onPresentationComplete={props.onPresentationComplete}
      retainedTarget={retainedTarget}
      target={target}
      transition={props.transition}
    />
  );
};

interface NestedRouterTarget {
  readonly childPending: boolean;
  readonly components: ApplicationComponents;
  readonly routing: ResolvedApplicationRouting | null;
  readonly runtime: RouterRuntime<ModuleMetadata>;
  readonly tree: RouterRuntimeActivationTree<ModuleMetadata> | undefined;
}

interface FramePresentationProps {
  readonly depth: number;
  readonly onPresentationComplete: () => void;
  readonly retainedTarget: NestedRouterTarget | null;
  readonly target: NestedRouterTarget | null;
  readonly transition: NativeFrameTransition | null;
}

interface FramePresentationState {
  readonly completedRevision: number | null;
  readonly next: NestedRouterTarget | null;
  readonly phase: 'dismissing' | 'presenting' | 'visible';
  readonly revision: number | null;
  readonly target: NestedRouterTarget | null;
}

const FramePresentation: React.FC<FramePresentationProps> = (props) => {
  const localTransition = props.transition?.depth === props.depth ? props.transition : null;
  const [state, setState] = React.useState<FramePresentationState>(() => ({
    completedRevision: null,
    next: null,
    phase: localTransition?.operation === 'present' ? 'presenting' : 'visible',
    revision: localTransition?.revision ?? null,
    target:
      localTransition?.operation === 'dismiss' || localTransition?.operation === 'replace'
        ? props.retainedTarget
        : props.target,
  }));

  React.useLayoutEffect(() => {
    setState((current) =>
      reconcileFramePresentation(current, props.target, props.retainedTarget, localTransition),
    );
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
          phase: 'presenting',
          revision: current.revision,
          target: current.next,
        };
      }

      return {
        ...current,
        completedRevision: current.revision,
        next: null,
        phase: 'visible',
        target: current.phase === 'dismissing' ? null : current.target,
      };
    });
  }, []);
  const presentation = React.useMemo<ScreenPresentation | null>(() => {
    const target = state.target;

    if (!target) return null;

    return Object.freeze({
      content: (
        <NestedRouterHost
          exception={target.components.exception}
          onPresentationComplete={handlePresentationComplete}
          phase={state.phase}
          presentationRevision={state.revision}
          routing={target.routing}
          runtime={target.runtime}
        >
          <RouterHost
            components={target.components}
            pending={target.childPending}
            presentation="frame"
            runtime={target.runtime}
            tree={target.tree}
          />
          {target.childPending ? null : (
            <NestedRouterLayer
              components={target.components}
              depth={props.depth + 1}
              onPresentationComplete={props.onPresentationComplete}
              retainedTree={props.retainedTarget?.tree}
              routing={target.routing}
              runtime={target.runtime}
              transition={props.transition}
              tree={target.tree}
            />
          )}
        </NestedRouterHost>
      ),
      key: `frame-${resolveRuntimePresentationKey(target.runtime)}`,
    });
  }, [
    handlePresentationComplete,
    props.depth,
    props.onPresentationComplete,
    props.retainedTarget?.tree,
    props.transition,
    state.phase,
    state.revision,
    state.target,
  ]);

  if (!presentation) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <ScreenLayerHost depth={props.depth} kind="frame">
        <ScreenRenderer presentation={presentation} style={StyleSheet.absoluteFill} />
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
    if (current.phase !== 'visible') return current;
    if (!current.target) return target ? { ...current, target } : current;
    if (current.target.runtime !== target?.runtime) return current;

    return current.target === target ? current : { ...current, target };
  }

  if (transition.revision === current.revision) {
    if (current.phase !== 'visible' || current.target?.runtime !== target?.runtime) return current;

    return current.target === target ? current : { ...current, target };
  }

  switch (transition.operation) {
    case 'dismiss':
      return {
        completedRevision: null,
        next: null,
        phase: 'dismissing',
        revision: transition.revision,
        target: current.target ?? retainedTarget,
      };
    case 'present':
      return {
        completedRevision: null,
        next: null,
        phase: 'presenting',
        revision: transition.revision,
        target,
      };
    case 'replace':
      return current.target
        ? {
            completedRevision: null,
            next: target,
            phase: 'dismissing',
            revision: transition.revision,
            target: current.target,
          }
        : retainedTarget
          ? {
              completedRevision: null,
              next: target,
              phase: 'dismissing',
              revision: transition.revision,
              target: retainedTarget,
            }
          : {
              completedRevision: null,
              next: null,
              phase: 'presenting',
              revision: transition.revision,
              target,
            };
  }
};

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
    routing: props.routing,
    runtime: 'tree' in activeChild ? activeChild.tree.runtime : activeChild.runtime,
    tree: 'tree' in activeChild ? activeChild.tree : undefined,
  });
};

const resolveRuntimePresentationKey = (runtime: RouterRuntime<ModuleMetadata>): number => {
  const current = runtimePresentationKeys.get(runtime);

  if (current !== undefined) return current;

  const key = ++runtimePresentationSequence;

  runtimePresentationKeys.set(runtime, key);
  return key;
};

const runtimePresentationKeys = new WeakMap<RouterRuntime<ModuleMetadata>, number>();
let runtimePresentationSequence = 0;

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
