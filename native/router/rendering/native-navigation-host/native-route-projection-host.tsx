import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApplicationRouterHistoryEntry } from '../../../../core/application/lifecycle/application';
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
import { getRoutePresentationDefinition } from '../../declaration/route';
import { RouteHost, RouteModuleHost } from '../route-host';
import {
  type NativePendingRouteProjection,
  resolveNativePendingRouteProjection,
  resolveNativeRouteChangeDepth,
  resolveNativeRouteIndexPresentationKey,
  resolveNativeRoutePresentationKey,
} from './native-route-projection.ts';

interface NativeRouteProjectionHostProps {
  readonly components: ApplicationComponents;
  readonly current: NavigationState | undefined;
  readonly dismissing: boolean;
  readonly entries: readonly ApplicationRouterHistoryEntry<ModuleMetadata>[];
  readonly onPresentationComplete: () => void;
  readonly pending: NavigationState | null;
}

export const NativeRouteProjectionHost: React.FC<NativeRouteProjectionHostProps> = (props) => {
  const focusedEntry = props.entries.at(-1) ?? null;
  const current = focusedEntry?.activation.navigation ?? props.current;
  const currentPath = current?.root.path ?? EMPTY_PATH;
  const previousPath = React.useRef(currentPath);
  const presentationDepth = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    previousPath.current = currentPath;
  }, [currentPath]);

  if (props.pending && props.pending.root.path.length === 0) {
    return props.components.fallback ?? null;
  }

  const pending = resolveNativePendingRouteProjection(current, props.pending);
  const focusedTree = focusedEntry?.tree ?? null;
  const sourcePath = pending ? currentPath : previousPath.current;
  const targetPath = pending?.path ?? currentPath;
  const transitionDepth = pending?.changeDepth ?? resolveNativeRouteChangeDepth(sourcePath, targetPath);
  const transition =
    transitionDepth === null
      ? null
      : Object.freeze({
          ...resolveTransition(sourcePath, targetPath, props.dismissing),
          depth: transitionDepth,
        });

  if (transitionDepth !== null) {
    presentationDepth.current = transitionDepth;
  } else if (presentationDepth.current === null && currentPath.length > 0) {
    presentationDepth.current = currentPath.length - 1;
  }

  if (focusedTree === null && pending === null) {
    return props.components.fallback ?? null;
  }

  return (
    <NativeRouteOutletHost
      components={props.components}
      completionDepth={presentationDepth.current}
      currentPath={currentPath}
      depth={0}
      onPresentationComplete={props.onPresentationComplete}
      pending={pending}
      transition={transition}
      tree={focusedTree}
    />
  );
};

interface NativeRouteOwner {
  readonly entry: NavigationRouteEntry;
  readonly runtime: RouteActivationRuntime<ModuleMetadata>;
}

interface NativeRouteOutletHostProps {
  readonly components: ApplicationComponents;
  readonly completionDepth: number | null;
  readonly currentPath: readonly NavigationRouteEntry[];
  readonly depth: number;
  readonly onPresentationComplete: () => void;
  readonly owner?: NativeRouteOwner;
  readonly pending: NativePendingRouteProjection | null;
  readonly transition: NativeScreenTransition | null;
  readonly tree: RouterRuntimeActivationTree<ModuleMetadata> | null;
}

interface NativeScreenTransition {
  readonly animation: ScreenAnimation | undefined;
  readonly depth: number;
  readonly operation: ScreenTransitionOperation;
}

const NativeRouteOutletHost: React.FC<NativeRouteOutletHostProps> = (props) => {
  const pendingAtOutlet = props.pending?.changeDepth === props.depth ? props.pending : null;
  const target = pendingAtOutlet
    ? createPendingTarget(props.components, pendingAtOutlet, props.depth, props.owner)
    : createCommittedTarget(props);
  const previousKey = React.useRef<string | null>(null);
  const transition =
    target && props.transition?.depth === props.depth && target.presentation.key !== previousKey.current
      ? props.transition.animation
        ? Object.freeze({ animation: props.transition.animation, operation: props.transition.operation })
        : undefined
      : undefined;
  const presentation = target ? Object.freeze({ ...target.presentation, transition }) : null;

  React.useLayoutEffect(() => {
    previousKey.current = target?.presentation.key ?? null;
  }, [target?.presentation.key]);

  return (
    <View style={styles.outlet}>
      <ScreenRenderer
        onPresentationComplete={props.completionDepth === props.depth ? props.onPresentationComplete : undefined}
        presentation={presentation}
      />
    </View>
  );
};

interface NativeScreenTarget {
  readonly presentation: ScreenPresentation;
}

const createCommittedTarget = (props: NativeRouteOutletHostProps): NativeScreenTarget | null => {
  const entry = props.currentPath[props.depth] ?? null;
  const tree = props.tree;
  const runtime = tree?.routes[props.depth] ?? null;

  if (entry && runtime && tree) {
    if (entry.route !== runtime.route) {
      throw new Error('Core navigation path и focused runtime tree содержат разные Route.');
    }

    return Object.freeze({
      presentation: Object.freeze({
        content: (
          <NativeRouteScreen
            components={props.components}
            completionDepth={props.completionDepth}
            currentPath={props.currentPath}
            depth={props.depth}
            entry={entry}
            onPresentationComplete={props.onPresentationComplete}
            pending={props.pending}
            runtime={runtime}
            transition={props.transition}
            tree={tree}
          />
        ),
        key: resolveNativeRoutePresentationKey(entry, props.depth),
      }),
    });
  }

  if (!entry && !runtime && props.owner) {
    return Object.freeze({
      presentation: Object.freeze({
        content: <RouteModuleHost components={props.components} presentation="screen" runtime={props.owner.runtime} />,
        key: resolveNativeRouteIndexPresentationKey(props.owner.entry, props.depth),
      }),
    });
  }

  if (!entry && !runtime) return null;

  throw new Error('Core navigation path и focused runtime tree имеют разную глубину.');
};

interface NativeRouteScreenProps {
  readonly components: ApplicationComponents;
  readonly completionDepth: number | null;
  readonly currentPath: readonly NavigationRouteEntry[];
  readonly depth: number;
  readonly entry: NavigationRouteEntry;
  readonly onPresentationComplete: () => void;
  readonly pending: NativePendingRouteProjection | null;
  readonly runtime: RouteActivationRuntime<ModuleMetadata>;
  readonly transition: NativeScreenTransition | null;
  readonly tree: RouterRuntimeActivationTree<ModuleMetadata>;
}

const NativeRouteScreen: React.FC<NativeRouteScreenProps> = (props) => {
  const route = getRouteDefinition(props.runtime.route);
  const definition = getRoutePresentationDefinition(props.runtime.route);
  const components = inheritRouteComponents(props.components, definition);
  const content =
    route.routes.length > 0 ? (
      <NativeRouteOutletHost
        components={components}
        completionDepth={props.completionDepth}
        currentPath={props.currentPath}
        depth={props.depth + 1}
        onPresentationComplete={props.onPresentationComplete}
        owner={{ entry: props.entry, runtime: props.runtime }}
        pending={props.pending}
        transition={props.transition}
        tree={props.tree}
      />
    ) : (
      <RouteModuleHost components={components} presentation="screen" runtime={props.runtime} />
    );

  return (
    <RouteHost components={components} layouts={definition.layouts} presentation="screen" runtime={props.runtime}>
      {content}
    </RouteHost>
  );
};

const createPendingTarget = (
  components: ApplicationComponents,
  pending: NativePendingRouteProjection,
  depth: number,
  owner?: NativeRouteOwner,
): NativeScreenTarget => {
  const entry = pending.path[depth];

  if (!entry) {
    if (!owner) {
      throw new Error('Pending index screen не имеет Route owner.');
    }

    const key = resolveNativeRouteIndexPresentationKey(owner.entry, depth);

    return Object.freeze({
      presentation: Object.freeze({
        content: <RouteModuleHost components={components} presentation="screen" runtime={owner.runtime} />,
        key,
      }),
    });
  }

  return Object.freeze({
    presentation: Object.freeze({
      content: components.fallback ?? null,
      key: resolveNativeRoutePresentationKey(entry, depth),
    }),
  });
};

const inheritRouteComponents = (
  components: ApplicationComponents,
  definition: ReturnType<typeof getRoutePresentationDefinition>,
): ApplicationComponents => {
  return Object.freeze({
    ...components,
    exception: definition.exception ?? components.exception,
    fallback: definition.fallback ?? components.fallback,
    forbidden: definition.forbidden ?? components.forbidden,
    notFound: definition.notFound ?? components.notFound,
  });
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

  if (entering) {
    return Object.freeze({ animation: entering, operation: 'present' });
  }

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

const EMPTY_PATH: readonly NavigationRouteEntry[] = Object.freeze([]);

const styles = StyleSheet.create({
  outlet: {
    flex: 1,
  },
});
