import React from 'react';

import type { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import type { MetadataComposition } from '../../../../core/metadata/composition/metadata-composition';
import { RouterMetadata } from '../../../../core/metadata/runtime/router-metadata';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';

export const useRouterMetadata = <TPresentation>(
  router: RouterRuntime<TPresentation> | null,
  application?: MetadataServiceInterface,
) => {
  const observer = React.useMemo(
    () => (router ? new RouterMetadata(router, application) : null),
    [router, application],
  );
  return React.useSyncExternalStore(
    observer?.subscribe ?? EMPTY_SUBSCRIBE,
    observer?.getSnapshot ?? EMPTY_SNAPSHOT,
    observer?.getSnapshot ?? EMPTY_SNAPSHOT,
  );
};

const EMPTY: MetadataComposition = Object.freeze({ application: {}, page: {}, frames: [] });
const EMPTY_SNAPSHOT = () => EMPTY;
const EMPTY_SUBSCRIBE = () => () => {};
