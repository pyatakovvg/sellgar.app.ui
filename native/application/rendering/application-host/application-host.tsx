import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type {
  ApplicationLifecycleListener,
  ApplicationLifecycleSnapshot,
} from '../../../../core/application/lifecycle/application-lifecycle';
import type { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';
import { renderApplicationFeatures } from '../../feature/application-feature-renderer';
import type { ApplicationComponents } from '../../config/application-configurator';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { NativeRouterBridge } from '../../../router/bridge/native-router-bridge';
import type { NativePresentationRuntime } from '../../../router/runtime/native-presentation-runtime';
import { NestedRouterLayer } from '../../../router/rendering/nested-router-layer';
import { NativeNavigationHost } from '../../../router/rendering/native-navigation-host';
import { NavigationStateProvider } from '../../../router/runtime/navigation-state-context';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import type { ResolvedApplicationRouting } from '../../config/application-configurator';
import { ApplicationComponentsProvider } from '../application-components-context';
import { OverlayHost } from '../overlay-host';
import { PresentationLayer } from '../presentation-layer';

export interface ApplicationViewSource {
  readonly components: ApplicationComponents;
  readonly failRender: (error: unknown) => void | Promise<void>;
  readonly features: readonly ApplicationFeatureInterface[];
  readonly getLifecycle: () => ApplicationLifecycleSnapshot;
  readonly getRouterRuntime: () => RouterRuntime<ModuleMetadata>;
  readonly layouts: readonly LayoutConstructor[];
  readonly routing: ResolvedApplicationRouting | null;
  readonly routerBridge: NativeRouterBridge;
  readonly presentationRuntime: NativePresentationRuntime;
  readonly scope: RuntimeScope;
  readonly subscribeLifecycle: (listener: ApplicationLifecycleListener) => () => void;
}

interface IProps {
  readonly source: ApplicationViewSource;
}

export const ApplicationHost: React.FC<IProps> = (props) => {
  const lifecycle = React.useSyncExternalStore(
    props.source.subscribeLifecycle,
    props.source.getLifecycle,
    props.source.getLifecycle,
  );
  if (lifecycle.phase === 'disposing' || lifecycle.phase === 'disposed') return null;

  let content: React.ReactNode;
  let applicationFeatures: React.ReactNode = null;
  let framePresentation: React.ReactNode = null;
  let modalFeatures: React.ReactNode = null;
  let notificationFeatures: React.ReactNode = null;

  if (lifecycle.phase === 'failed') {
    content = (
      <ExceptionProvider error={lifecycle.error}>
        {props.source.components.failed ?? props.source.components.exception ?? null}
      </ExceptionProvider>
    );
  } else if (lifecycle.phase !== 'ready') {
    content = props.source.components.splash ?? null;
  } else {
    const runtime = props.source.getRouterRuntime();

    content = renderLayouts(
      props.source.layouts,
      <NativeNavigationHost
        components={props.source.components}
        presentationRuntime={props.source.presentationRuntime}
        runtime={runtime}
      />,
    );
    framePresentation = <NativeFramePresentationHost source={props.source} />;

    applicationFeatures = renderApplicationFeatures(props.source.features, PresentationLayer.Application);
    modalFeatures = renderApplicationFeatures(props.source.features, PresentationLayer.Modal);
    notificationFeatures = renderApplicationFeatures(props.source.features, PresentationLayer.Notification);
  }

  return (
    <RuntimeScopeProvider scope={props.source.scope}>
      <NavigationStateProvider source={props.source.presentationRuntime}>
        <ApplicationComponentsProvider components={props.source.components}>
          <GestureHandlerRootView style={styles.root}>
            <SafeAreaProvider style={styles.root}>
              <RuntimeErrorBoundary
                exception={props.source.components.failed ?? props.source.components.exception}
                onError={(error) => void props.source.failRender(error)}
                resetKeys={[props.source]}
              >
                <OverlayHost frame={framePresentation} modal={modalFeatures} notification={notificationFeatures}>
                  {content}
                  {applicationFeatures}
                </OverlayHost>
              </RuntimeErrorBoundary>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </ApplicationComponentsProvider>
      </NavigationStateProvider>
    </RuntimeScopeProvider>
  );
};

const NativeFramePresentationHost: React.FC<IProps> = ({ source }) => {
  const presentation = React.useSyncExternalStore(
    source.presentationRuntime.subscribeFrame,
    source.presentationRuntime.getFrameSnapshot,
    source.presentationRuntime.getFrameSnapshot,
  );
  const dismissPending = React.useCallback(() => source.routerBridge.back(), [source.routerBridge]);

  if (!presentation) return null;

  const navigation = presentation.application;

  if (!navigation.navigation && !navigation.pending) return null;

  const runtime = source.getRouterRuntime();
  const retainedTree =
    presentation.transition && navigation.navigation
      ? runtime.findActivation(navigation.navigation)?.getTreeSnapshot()
      : undefined;

  return (
    <NestedRouterLayer
      components={source.components}
      decision={navigation.decision}
      depth={0}
      dismissPending={dismissPending}
      onPresentationComplete={source.presentationRuntime.completeFrame}
      pending={navigation.pending?.root}
      retainedTree={retainedTree}
      routing={source.routing}
      runtime={runtime}
      transition={presentation.transition}
    />
  );
};

export const createApplicationView = (source: ApplicationViewSource): React.FC => {
  return Object.assign(ApplicationHost.bind(null, { source }), { displayName: 'ApplicationView' });
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
