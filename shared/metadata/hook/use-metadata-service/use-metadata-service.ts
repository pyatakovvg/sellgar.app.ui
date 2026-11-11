import React from 'react';

import type { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';

/** Uses the current owner's service and rerenders when its local metadata changes. */
export const useMetadataService = (metadata: MetadataServiceInterface): MetadataServiceInterface => {
  const subscribe = React.useCallback((listener: () => void) => metadata.subscribe(listener), [metadata]);
  const getSnapshot = React.useCallback(() => metadata.getSnapshot(), [metadata]);

  React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return metadata;
};
