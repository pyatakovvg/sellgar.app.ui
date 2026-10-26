'use client';

import React from 'react';

import { useApplication } from '../../../application/hook/use-application';
import { ControllerRuntimeProvider } from '../../../../react/controller/runtime/controller-runtime-context';
import { RuntimeScopeProvider } from '../../../../react/runtime/scope/runtime-scope-context';
import type { LayoutViewProps } from '../../../../react/layout/declaration/layout';
import { renderLayouts } from '../../../../react/layout/rendering/layout-renderer';
import { renderView } from '../../../../react/view/renderable-view';
import type { ModuleExports } from '../../../../core/module/resolution/module-export-resolver';
import type { ModuleSnapshot } from '../../contract/module-snapshot';
import { ClientModule } from '../../runtime/client-module';
import { ModuleContext } from '../../runtime/module-context';

interface IProps {
  readonly children?: React.ReactNode;
  readonly moduleExports: ModuleExports;
  readonly snapshot: ModuleSnapshot;
}

export function ModuleHost(props: IProps) {
  const [module] = React.useState(() => new ClientModule(props.moduleExports, props.snapshot));
  const app = useApplication();
  const parent = React.useContext(ModuleContext);
  const parentReady = React.useSyncExternalStore(
    parent?.subscribe ?? EMPTY_SUBSCRIBE,
    () => parent?.isReady ?? true,
    () => parent === null,
  );
  const ready = React.useSyncExternalStore(
    module.subscribe,
    () => module.isReady,
    () => false,
  );
  const error = React.useSyncExternalStore(
    module.subscribe,
    () => module.failure,
    () => null,
  );

  React.useEffect(() => {
    if (!app || !parentReady) return;
    const lease = module.acquire(app, parent?.session ?? undefined);
    void lease.ready.catch(() => undefined); // The subscription sends activation failures to the Next error boundary.
    return lease.release;
  }, [app, module, parent, parentReady]);

  if (error !== null) throw error;
  const presentation = module.definition.presentation;
  const content =
    presentation.kind === 'layout'
      ? React.isValidElement<LayoutViewProps>(presentation.metadata.view)
        ? React.cloneElement(presentation.metadata.view, { children: props.children, kind: 'layout' })
        : renderView(presentation.metadata.view, { children: props.children, kind: 'layout' })
      : renderLayouts(presentation.metadata.layouts ?? [], renderView(presentation.metadata.view, {}), 'module');

  return (
    <ModuleContext.Provider value={module}>
      <ControllerRuntimeProvider value={module}>
        {ready && module.scope ? <RuntimeScopeProvider scope={module.scope}>{content}</RuntimeScopeProvider> : content}
      </ControllerRuntimeProvider>
    </ModuleContext.Provider>
  );
}

const EMPTY_SUBSCRIBE = () => () => {};
