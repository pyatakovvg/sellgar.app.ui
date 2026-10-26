import 'server-only';
import React from 'react';
import { connection } from 'next/server';
import type { ModuleLoader, ModulePageProps } from '../../../module/contract/module-snapshot';
import { captureModuleSnapshot } from '../../../module/runtime/module-session';
import ModuleClientEntry from '../../../module/rendering/client-entry';
import { getLayoutScopeRegistry } from '../../runtime/server-layout';

export interface LayoutSegmentProps extends Pick<ModulePageProps, 'params'> {
  readonly children: React.ReactNode;
}

export function withLayout(_load: ModuleLoader, entryId?: string) {
  if (!entryId)
    throw new Error(
      'withLayout() требует подключения withApp() и загрузчика вида () => import(...) со строковым литералом.',
    );
  return async function SellgarSegmentLayout(props: LayoutSegmentProps) {
    await connection();
    const registry = await getLayoutScopeRegistry();
    const session = await registry.ensure(entryId, { ...(await props.params) });
    const snapshot = captureModuleSnapshot(session.runtime, {
      kind: 'layout',
      id: session.id,
      params: { ...session.runtime.getParams() },
      props: { searchParams: {} },
    });
    return (
      <ModuleClientEntry key={entryId} moduleId={entryId} snapshot={snapshot}>
        {props.children}
      </ModuleClientEntry>
    );
  };
}
