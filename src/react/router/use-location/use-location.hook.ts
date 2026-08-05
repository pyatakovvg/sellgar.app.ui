import React from 'react';

import { LocationServiceInterface } from '../../../router/service/location-service';
import type { RouteMatchOptions, RouterLocationSnapshot } from '../../../router/service/location-service';
import type {
  RouterParamsConstructor,
  RouterParamsObjectOptions,
} from '../../../router/params/router-params-converter';
import { useDependency } from '../../../runtime/react';

const EMPTY_LOCATION: RouterLocationSnapshot = {
  hash: '',
  hashParams: {},
  key: '',
  params: {},
  pathname: '/',
  search: '',
  searchParams: {},
  state: null,
};

export interface LocationHandler extends RouterLocationSnapshot {
  matches(path: string, options?: RouteMatchOptions): boolean;

  hashToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;

  paramsToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;

  searchToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;
}

export const useLocation = (): LocationHandler => {
  const locationService = useDependency(LocationServiceInterface);
  const subscribe = React.useCallback(
    (listener: () => void) => {
      return locationService.subscribe(listener);
    },
    [locationService],
  );
  const location = React.useSyncExternalStore(
    subscribe,
    () => locationService.location,
    () => locationService.location,
  );
  const snapshot = location ?? EMPTY_LOCATION;

  return React.useMemo(
    () => ({
      ...snapshot,
      hashToObject: <TValue extends object>(
        target: RouterParamsConstructor<TValue>,
        options?: RouterParamsObjectOptions,
      ) => {
        return locationService.hashToObject(target, options);
      },
      paramsToObject: <TValue extends object>(
        target: RouterParamsConstructor<TValue>,
        options?: RouterParamsObjectOptions,
      ) => {
        return locationService.paramsToObject(target, options);
      },
      searchToObject: <TValue extends object>(
        target: RouterParamsConstructor<TValue>,
        options?: RouterParamsObjectOptions,
      ) => {
        return locationService.searchToObject(target, options);
      },
      matches: (path: string, options?: RouteMatchOptions) => {
        return locationService.matches(path, options);
      },
    }),
    [locationService, snapshot],
  );
};
