'use client';

import React from 'react';

import type { Application } from '../../lifecycle/application';
import { useApplication } from '../../hook/use-application';
import type { ApplicationSnapshot, ApplicationStateToken } from '../application-state';

export const ApplicationSnapshotContext = React.createContext<ApplicationSnapshot>({});
export const ApplicationPreparationContext = React.createContext<(() => Promise<Application>) | null>(null);

const EMPTY_SUBSCRIBE = () => () => {};

export function useApplicationState<TSnapshot>(token: ApplicationStateToken<TSnapshot>): TSnapshot {
  const snapshot = React.useContext(ApplicationSnapshotContext);
  const initial = React.useMemo(() => token.deserialize(snapshot[token.key]), [snapshot, token]);
  const app = useApplication();
  const state = app?.getDependency(token);
  const subscribe = React.useCallback(
    (listener: () => void) => state?.subscribe(listener) ?? EMPTY_SUBSCRIBE(),
    [state],
  );
  const getSnapshot = React.useCallback(() => state?.getSnapshot() ?? initial, [state, initial]);
  const getServerSnapshot = React.useCallback(() => initial, [initial]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Commands await the same bootstrap that prepared the server-rendered state. */
export function useReadyApplication(): () => Promise<Application> {
  const ready = React.useContext(ApplicationPreparationContext);
  if (!ready) throw new Error('useReadyApplication() requires the Next application host.');
  return ready;
}
