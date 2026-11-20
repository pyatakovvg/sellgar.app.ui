'use client';

import React from 'react';

import { useApplication } from '../../../application/hook/use-application';
import { getApplicationRuntime } from '../../../application/lifecycle/application';
import { NavigationContext } from '../../../router/runtime/navigation-context';

import s from './default.module.css';

export const ModuleNavigationContent: React.FC<React.PropsWithChildren> = (props) => {
  const app = useApplication();
  const navigation = React.useContext(NavigationContext);
  const pending = React.useSyncExternalStore(
    navigation?.subscribe ?? EMPTY_SUBSCRIBE,
    navigation?.getSnapshot ?? NOT_PENDING,
    NOT_PENDING,
  );
  const fallback = app ? getApplicationRuntime(app).getComponents().fallback : undefined;
  const showFallback = pending && fallback !== undefined;

  return (
    <>
      <div className={s.content} hidden={showFallback}>
        {props.children}
      </div>
      {showFallback ? fallback : null}
    </>
  );
};

const EMPTY_SUBSCRIBE = () => () => {};
const NOT_PENDING = () => false;
