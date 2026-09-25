import React from 'react';
import type { ApplicationFeaturesRuntime } from '../../../../core/application/feature/application-features-runtime';

const Context = React.createContext<ApplicationFeaturesRuntime | null>(null);

export const useApplicationFeaturesRuntime = (): ApplicationFeaturesRuntime | null => React.useContext(Context);

interface IProps {
  readonly runtime: ApplicationFeaturesRuntime;
  readonly children: React.ReactNode;
  readonly fallback: React.ReactNode;
}

export const ApplicationFeaturesHost: React.FC<IProps> = (props) => {
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
  );
  if (props.runtime.requiresPreparation && snapshot.phase !== 'ready') return props.fallback;
  return <Context.Provider value={props.runtime}>{props.children}</Context.Provider>;
};
