import React from 'react';

import type { ApplicationNavigationDecision } from '../../../../core/application/lifecycle/application';
import type { RouterRuntime, RouterRuntimeActivationTree } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { ModulePresentationMode } from '../../../module/rendering/module-host';
import { RoutePathHost } from './route-path-host.tsx';
import { RouterPresentationHost } from './router-presentation-host.tsx';

interface IProps {
  readonly components: ApplicationComponents;
  readonly decision?: ApplicationNavigationDecision | null;
  readonly pending?: boolean;
  readonly presentation: ModulePresentationMode;
  readonly runtime: RouterRuntime<ModuleMetadata>;
  readonly tree?: RouterRuntimeActivationTree<ModuleMetadata>;
}

export const RouterHost: React.FC<IProps> = (props) => {
  return (
    <RouterPresentationHost
      components={props.components}
      decision={props.decision}
      runtime={props.runtime}
      snapshot={props.tree?.snapshot}
    >
      {({ components }) => renderRouterContent(props, components)}
    </RouterPresentationHost>
  );
};

const renderRouterContent = (props: IProps, components: ApplicationComponents): React.ReactNode => {
  if (props.pending) return components.fallback ?? null;

  const branch = props.tree
    ? { pendingLocalChange: null, routes: props.tree.routes }
    : props.runtime.getBranchSnapshot();

  if (branch.routes.length === 0) return components.fallback ?? null;

  return (
    <RoutePathHost
      components={components}
      pendingAfterRouteCount={branch.pendingLocalChange?.commonRouteCount}
      presentation={props.presentation}
      routes={branch.routes}
    />
  );
};
