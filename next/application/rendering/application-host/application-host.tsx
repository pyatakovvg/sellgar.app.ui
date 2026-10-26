'use client';

import React from 'react';

import { RuntimeScopeProvider } from '../../../../react/runtime/scope/runtime-scope-context';
import { ApplicationFeaturesHost } from '../../../../shared/application/feature/application-features-host';
import type { Application } from '../../lifecycle/application';
import { ApplicationContext } from '../../runtime/application-context';
import { acquireBrowserApplication } from '../../runtime/browser-application';

interface IProps {
  readonly children: React.ReactNode;
}

export const ApplicationHost: React.FC<IProps> = (props) => {
  const [app, setApp] = React.useState<Application | null>(null);
  const [failure, setFailure] = React.useState<{ readonly error: unknown } | null>(null);

  React.useEffect(() => {
    const lease = acquireBrowserApplication();
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
  }, []);

  if (failure) throw failure.error;

  // Preserve the Next server HTML; a client-only bootstrap must not replace
  // the entire page with a loading screen or require serialization of a DI container.
  if (!app) return <ApplicationContext.Provider value={null}>{props.children}</ApplicationContext.Provider>;

  return <ReadyApplicationHost app={app}>{props.children}</ReadyApplicationHost>;
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

  return (
    <ApplicationContext.Provider value={props.app}>
      <RuntimeScopeProvider scope={props.app.contextScope}>
        <ApplicationFeaturesHost runtime={props.app.contextFeatures} fallback={props.children}>
          {props.children}
        </ApplicationFeaturesHost>
      </RuntimeScopeProvider>
    </ApplicationContext.Provider>
  );
};
