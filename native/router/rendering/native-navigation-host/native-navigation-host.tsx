import React from 'react';

import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { RouterPresentationHost } from '../router-host';
import { NativeBackGestureHost } from './native-back-gesture-host.tsx';
import { NativeRouteProjectionHost } from './native-route-projection-host.tsx';
import type { NativePresentationRuntime } from '../../runtime/native-presentation-runtime';

interface NativeNavigationHostProps {
  readonly components: ApplicationComponents;
  readonly presentationRuntime: NativePresentationRuntime;
  readonly requestBack: () => void | Promise<void>;
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
          <NativeBackGestureHost requestBack={props.requestBack}>
            <NativeRouteProjectionHost runtime={props.presentationRuntime.routes} />
          </NativeBackGestureHost>
        ) : (
          (props.components.fallback ?? null)
        )
      }
    </RouterPresentationHost>
  );
};
