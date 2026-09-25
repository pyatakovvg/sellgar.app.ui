import React from 'react';
import type { ApplicationFeaturesRuntime } from '../../../../core/application/feature/application-features-runtime';
import { ApplicationFeaturesHost } from '../../../../shared/application/feature/application-features-host';
import type { ApplicationFeatureToken } from '../../../../core/application/feature/application-feature';
import {
  renderApplicationFeatures,
  wrapApplicationFeatures,
} from '../../../../shared/application/feature/application-feature-renderer';
import { OverlayHost } from '../../../../shared/application/rendering/overlay-host';

import type {
  ApplicationLifecycleListener,
  ApplicationLifecycleSnapshot,
} from '../../../../core/application/lifecycle/application-lifecycle';
import type {
  ApplicationNavigationListener,
  ApplicationNavigationSnapshot,
} from '../../../../core/application/lifecycle/application';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';
import { requireRuntimeException, type RuntimeException } from '../../../../core/runtime/exception/runtime-exception';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { RouterHost } from '../../../router/rendering/router-host';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';
import type { ApplicationComponents } from '../../config/application-configurator';
import { ApplicationComponentsProvider } from '../application-components-context';

import s from './default.module.scss';

export interface ApplicationViewSource {
  readonly featuresRuntime: ApplicationFeaturesRuntime;
  readonly features: readonly ApplicationFeatureToken[];
  readonly components: ApplicationComponents;
  readonly createRenderException: (error: unknown) => RuntimeException;
  readonly failRender: (error: unknown) => void | Promise<void>;
  readonly getLifecycle: () => ApplicationLifecycleSnapshot;
  readonly getNavigation: () => ApplicationNavigationSnapshot;
  readonly layouts: readonly LayoutConstructor[];
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

  if (lifecycle.phase === 'failed') {
    content = (
      <ExceptionProvider exception={requireRuntimeException(lifecycle.exception)}>
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
  }

  return (
    <RuntimeScopeProvider scope={props.source.scope}>
      <ApplicationComponentsProvider components={props.source.components}>
        <RuntimeErrorBoundary
          exception={props.source.components.failed ?? props.source.components.exception}
          onError={(error) => void props.source.failRender(error)}
          resolveException={props.source.createRenderException}
          resetKeys={[props.source]}
        >
          <ApplicationFeaturesHost runtime={props.source.featuresRuntime} fallback={content}>
            {wrapApplicationFeatures(
              props.source.features,
              <RuntimeErrorBoundary
                exception={props.source.components.failed ?? props.source.components.exception}
                onError={(error) => void props.source.failRender(error)}
                resolveException={props.source.createRenderException}
                resetKeys={[props.source]}
              >
                <OverlayHost
                  frame={null}
                  modal={lifecycle.phase === 'ready' ? renderApplicationFeatures(props.source.features, 'modal') : null}
                  notification={
                    lifecycle.phase === 'ready'
                      ? renderApplicationFeatures(props.source.features, 'notification')
                      : null
                  }
                >
                  <div className={s.wrapper}>{content}</div>
                  {lifecycle.phase === 'ready' ? renderApplicationFeatures(props.source.features, 'application') : null}
                </OverlayHost>
              </RuntimeErrorBoundary>,
            )}
          </ApplicationFeaturesHost>
        </RuntimeErrorBoundary>
      </ApplicationComponentsProvider>
    </RuntimeScopeProvider>
  );
};

export const createApplicationView = (source: ApplicationViewSource): React.FC => {
  return Object.assign(ApplicationHost.bind(null, { source }), {
    displayName: 'ApplicationView',
  });
};
