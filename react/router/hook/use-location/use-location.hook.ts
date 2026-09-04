import React from 'react';

import type {
  RouterParamsConstructor,
  RouterParamsObjectOptions,
} from '../../../../core/router/params/router-params-converter';
import {
  LocationServiceInterface,
  type RouterLocationSnapshot,
} from '../../../../core/router/service/location-service';
import { useDependency } from '../../../runtime/scope/runtime-scope-context';

export interface LocationHandler extends RouterLocationSnapshot {
  paramsToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;
}

export const useLocation = (): LocationHandler => {
  const locationService = useDependency(LocationServiceInterface);
  const subscribe = React.useCallback((listener: () => void) => locationService.subscribe(listener), [locationService]);
  const getSnapshot = React.useCallback(() => locationService.location, [locationService]);
  const location = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const snapshot = location ?? EMPTY_LOCATION;

  return React.useMemo(
    () => ({
      ...snapshot,
      paramsToObject: <TValue extends object>(
        target: RouterParamsConstructor<TValue>,
        options?: RouterParamsObjectOptions,
      ) => locationService.paramsToObject(target, options),
    }),
    [locationService, snapshot],
  );
};

const EMPTY_LOCATION: RouterLocationSnapshot = Object.freeze({
  params: Object.freeze({}),
  state: undefined,
});
