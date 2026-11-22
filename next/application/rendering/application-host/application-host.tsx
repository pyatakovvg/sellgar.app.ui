'use client';

import React from 'react';

import { RuntimeScopeProvider } from '../../../../react/runtime/scope/runtime-scope-context';
import { ApplicationFeaturesHost } from '../../../../shared/application/feature/application-features-host';
import { renderApplicationFeatures } from '../../../../shared/application/feature/application-feature-renderer';
import { OverlayHost } from '../../../../shared/application/rendering/overlay-host';
import { PresentationLayer } from '../../../../shared/application/rendering/presentation-layer';
import { getApplicationRuntime, type Application } from '../../lifecycle/application';
import { ApplicationContext } from '../../runtime/application-context';
import type { ApplicationSnapshot } from '../../state/application-state';
import { ApplicationSnapshotContext, ApplicationPreparationContext } from '../../state/application-state-context';
import { startBrowserApplication, acquireBrowserApplication } from '../../runtime/browser-application';
import { NavigationActivity } from '../../../router/runtime/navigation-activity';
import { NavigationContext } from '../../../router/runtime/navigation-context';

interface IProps {
  readonly children: React.ReactNode;
  readonly snapshot?: ApplicationSnapshot;
}

export const ApplicationHost: React.FC<IProps> = (props) => {
  const [app, setApp] = React.useState<Application | null>(null);
  const [failure, setFailure] = React.useState<{ readonly error: unknown } | null>(null);
  const [navigation] = React.useState(() => new NavigationActivity());

  React.useEffect(() => {
    navigation.commitPage(window.location.pathname + window.location.search);
    const onPopState = () => navigation.beginNavigation(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigation]);

  React.useEffect(() => {
    const lease = acquireBrowserApplication(props.snapshot ?? EMPTY_SNAPSHOT);
    let active = true;

    void lease.ready.then(
      (instance) => {
        if (active) setApp(instance);
      },
      (error: unknown) => {
        if (active) setFailure({ error });
      },
    );

    return () => {
      active = false;
      lease.release();
    };
  }, [props.snapshot]);

  const ready = React.useCallback(() => startBrowserApplication(props.snapshot ?? EMPTY_SNAPSHOT), [props.snapshot]);

  if (failure) throw failure.error;

  return (
    <ApplicationSnapshotContext.Provider value={props.snapshot ?? EMPTY_SNAPSHOT}>
      <ApplicationPreparationContext.Provider value={ready}>
        <NavigationContext.Provider value={navigation}>
          <ApplicationRuntimeHost app={app}>{props.children}</ApplicationRuntimeHost>
        </NavigationContext.Provider>
      </ApplicationPreparationContext.Provider>
    </ApplicationSnapshotContext.Provider>
  );
};

const ApplicationRuntimeHost: React.FC<IProps & { readonly app: Application | null }> = (props) => {
  const lifecycle = React.useSyncExternalStore(
    React.useCallback((listener) => props.app?.subscribe(listener) ?? (() => {}), [props.app]),
    () => props.app?.lifecycle ?? null,
    () => props.app?.lifecycle ?? null,
  );

  if (lifecycle?.phase === 'failed')
    throw lifecycle.exception?.cause ?? new Error('Приложение Next завершилось с ошибкой.');
  if (lifecycle?.phase === 'disposing' || lifecycle?.phase === 'disposed') return null;

  const runtime = props.app ? getApplicationRuntime(props.app) : null;
  const features = runtime?.getFeatureTokens() ?? [];

  return (
    <ApplicationContext.Provider value={props.app}>
      <RuntimeScopeProvider scope={runtime?.scope ?? null}>
        <ApplicationFeaturesHost runtime={runtime?.getFeatures() ?? null} fallback={props.children}>
          {props.children}
          {runtime && lifecycle?.phase === 'ready' ? (
            <OverlayHost
              frame={null}
              modal={renderApplicationFeatures(features, PresentationLayer.Modal)}
              notification={renderApplicationFeatures(features, PresentationLayer.Notification)}
            >
              {renderApplicationFeatures(features, PresentationLayer.Application)}
            </OverlayHost>
          ) : null}
        </ApplicationFeaturesHost>
      </RuntimeScopeProvider>
    </ApplicationContext.Provider>
  );
};

const EMPTY_SNAPSHOT = Object.freeze({});
