import React from 'react';

import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { RouterPresentationHost } from '../router-host';
import { NativeRouteProjectionHost } from './native-route-projection-host.tsx';
import type { NativePresentationRuntime } from '../../runtime/native-presentation-runtime';

interface NativeNavigationHostProps {
  readonly components: ApplicationComponents;
  readonly presentationRuntime: NativePresentationRuntime;
  readonly runtime: RouterRuntime<ModuleMetadata>;
}

export const NativeNavigationHost: React.FC<NativeNavigationHostProps> = (props) => {
  const presentation = React.useSyncExternalStore(
    props.presentationRuntime.subscribeNavigation,
    props.presentationRuntime.getNavigationSnapshot,
    props.presentationRuntime.getNavigationSnapshot,
  );

  return (
    <RouterPresentationHost components={props.components} decision={presentation.decision} runtime={props.runtime}>
      {() =>
        presentation.navigation || presentation.pending ? (
          <NativeRouteProjectionHost runtime={props.presentationRuntime.routes} />
        ) : (
          (props.components.fallback ?? null)
        )
      }
    </RouterPresentationHost>
  );
};
