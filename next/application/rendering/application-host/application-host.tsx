'use client';

import React from 'react';

import { RuntimeScopeProvider } from '../../../../react/runtime/scope/runtime-scope-context';
import { ApplicationFeaturesHost } from '../../../../shared/application/feature/application-features-host';
import { getApplicationRuntime, type Application } from '../../lifecycle/application';
import { ApplicationContext } from '../../runtime/application-context';
import type { ApplicationSnapshot } from '../../state/application-state';
import { ApplicationSnapshotContext, ApplicationPreparationContext } from '../../state/application-state-context';
import { startBrowserApplication, acquireBrowserApplication } from '../../runtime/browser-application';

interface IProps {
  readonly children: React.ReactNode;
  readonly snapshot?: ApplicationSnapshot;
}

export const ApplicationHost: React.FC<IProps> = (props) => {
  const [app, setApp] = React.useState<Application | null>(null);
  const [failure, setFailure] = React.useState<{ readonly error: unknown } | null>(null);

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

  const content = app ? (
    <ReadyApplicationHost app={app}>{props.children}</ReadyApplicationHost>
  ) : (
    <ApplicationContext.Provider value={null}>{props.children}</ApplicationContext.Provider>
  );

  return (
    <ApplicationSnapshotContext.Provider value={props.snapshot ?? EMPTY_SNAPSHOT}>
      <ApplicationPreparationContext.Provider value={ready}>{content}</ApplicationPreparationContext.Provider>
    </ApplicationSnapshotContext.Provider>
  );
};

const ReadyApplicationHost: React.FC<IProps & { readonly app: Application }> = (props) => {
  const lifecycle = React.useSyncExternalStore(
    React.useCallback((listener) => props.app.subscribe(listener), [props.app]),
    () => props.app.lifecycle,
    () => props.app.lifecycle,
  );

  if (lifecycle.phase === 'failed')
    throw lifecycle.exception?.cause ?? new Error('Приложение Next завершилось с ошибкой.');
  if (lifecycle.phase === 'disposing' || lifecycle.phase === 'disposed') return null;

  const runtime = getApplicationRuntime(props.app);

  return (
    <ApplicationContext.Provider value={props.app}>
      <RuntimeScopeProvider scope={runtime.scope}>
        <ApplicationFeaturesHost runtime={runtime.getFeatures()} fallback={props.children}>
          {props.children}
        </ApplicationFeaturesHost>
      </RuntimeScopeProvider>
    </ApplicationContext.Provider>
  );
};

const EMPTY_SNAPSHOT = Object.freeze({});
