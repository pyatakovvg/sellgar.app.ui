import 'server-only';

import React from 'react';
import { randomUUID } from 'node:crypto';
import { connection } from 'next/server';
import { getApplication } from '../../../application/runtime/server-application';
import type { ModuleLoader, ModulePageProps } from '../../contract/module-snapshot';
import { captureModuleSnapshot, createModuleRuntime } from '../../runtime/module-session';
import ModuleClientEntry from '../client-entry';
import { getLayoutScopeRegistry } from '../../../layout/runtime/server-layout';

/** The plugin supplies the static client entry without serializing the module loader or its classes. */
export function withModule(load: ModuleLoader, moduleId?: string) {
  if (!moduleId)
    throw new Error(
      'withModule() требует подключения withApp() и загрузчика вида () => import(...) со строковым литералом.',
    );

  return async function SellgarModulePage(props: ModulePageProps) {
    await connection();
    const app = await getApplication();
    const params = { ...(await props.params) };
    const searchParams = { ...(await props.searchParams) };
    const id = randomUUID();
    const parent = await (await getLayoutScopeRegistry()).parentFor(moduleId, params);
    const session = createModuleRuntime(app, load, id, { parent });
    const abort = session.abort;
    try {
      await session.runtime.load({ params, props: { searchParams }, signal: abort.signal });
      session.runtime.commit();
      const snapshot = captureModuleSnapshot(session.runtime, { id, params, props: { searchParams } });
      return <ModuleClientEntry key={id} moduleId={moduleId} snapshot={snapshot} />;
    } catch (error) {
      abort.abort();
      await session.dispose();
      throw error;
    }
  };
}
