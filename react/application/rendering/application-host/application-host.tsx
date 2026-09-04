import React from 'react';

import type {
  ApplicationLifecycleListener,
  ApplicationLifecycleSnapshot,
} from '../../../../core/application/lifecycle/application-lifecycle';
import type { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import type {
  ApplicationNavigationListener,
  ApplicationNavigationSnapshot,
} from '../../../../core/application/lifecycle/application';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';
import { renderApplicationFeatures } from '../../feature/application-feature-renderer';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { NestedRouterLayer } from '../../../router/rendering/nested-router-layer';
import { RouterHost } from '../../../router/rendering/router-host';
import { NavigationStateProvider } from '../../../router/runtime/navigation-state-context';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';
import type { ApplicationComponents, ResolvedApplicationRouting } from '../../config/application-configurator';
import { ApplicationComponentsProvider } from '../application-components-context';
import { OverlayHost } from '../overlay-host';
import { PresentationLayer } from '../presentation-layer';

import s from './default.module.scss';

export interface ApplicationViewSource {
  readonly components: ApplicationComponents;
  readonly createHref: (navigation: NavigationState) => string;
  readonly features: readonly ApplicationFeatureInterface[];
  readonly failRender: (error: unknown) => void | Promise<void>;
  readonly getLifecycle: () => ApplicationLifecycleSnapshot;
  readonly getNavigation: () => ApplicationNavigationSnapshot;
  readonly layouts: readonly LayoutConstructor[];
  readonly routing: ResolvedApplicationRouting | null;
  readonly routerRuntime: RouterRuntime<ModuleMetadata>;
  readonly scope: RuntimeScope;
  readonly subscribeLifecycle: (listener: ApplicationLifecycleListener) => () => void;
  readonly subscribeNavigation: (listener: ApplicationNavigationListener) => () => void;
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
  const navigation = React.useSyncExternalStore(
    props.source.subscribeNavigation,
    props.source.getNavigation,
    props.source.getNavigation,
  );

  if (lifecycle.phase === 'disposing' || lifecycle.phase === 'disposed') {
    return null;
  }

  let content: React.ReactNode;
  let frame: React.ReactNode = null;
  let applicationFeatures: React.ReactNode = null;
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
    content = renderLayouts(
      props.source.layouts,
      <RouterHost
        components={props.source.components}
        decision={navigation.decision}
        runtime={props.source.routerRuntime}
      />,
    );
    frame = (
      <NestedRouterLayer
        components={props.source.components}
        decision={navigation.decision}
        routing={props.source.routing}
        runtime={props.source.routerRuntime}
      />
    );
    applicationFeatures = renderApplicationFeatures(props.source.features, PresentationLayer.Application);
    modalFeatures = renderApplicationFeatures(props.source.features, PresentationLayer.Modal);
    notificationFeatures = renderApplicationFeatures(props.source.features, PresentationLayer.Notification);
  }

  return (
    <RuntimeScopeProvider scope={props.source.scope}>
      <NavigationStateProvider createHref={props.source.createHref} snapshot={navigation}>
        <ApplicationComponentsProvider components={props.source.components}>
          <RuntimeErrorBoundary
            exception={props.source.components.failed ?? props.source.components.exception}
            onError={(error) => void props.source.failRender(error)}
            resetKeys={[props.source]}
          >
            <OverlayHost frame={frame} modal={modalFeatures} notification={notificationFeatures}>
              <div className={s.wrapper}>{content}</div>
              {applicationFeatures}
            </OverlayHost>
          </RuntimeErrorBoundary>
        </ApplicationComponentsProvider>
      </NavigationStateProvider>
    </RuntimeScopeProvider>
  );
};

export const createApplicationView = (source: ApplicationViewSource): React.FC => {
  return Object.assign(ApplicationHost.bind(null, { source }), {
    displayName: 'ApplicationView',
  });
};
