'use client';

import { useContext, useSyncExternalStore } from 'react';
import { ModuleContext } from '../../runtime/module-context';

export function useModuleReady(): boolean {
  const module = useContext(ModuleContext);
  if (!module) throw new Error('useModuleReady() нужно вызывать внутри модуля Next.');
  return useSyncExternalStore(
    module.subscribe,
    () => module.isReady,
    () => false,
  );
}
