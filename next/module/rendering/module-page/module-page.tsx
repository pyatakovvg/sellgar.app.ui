import 'server-only';

import React, { cache } from 'react';
import { randomUUID } from 'node:crypto';
import { connection } from 'next/server';
import { composeMetadata } from '../../../../core/metadata/composition/metadata-composition';
import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import { getApplication } from '../../../application/runtime/server-application';
import type { ModuleLoader, ModulePageProps } from '../../contract/module-snapshot';
import { captureModuleSnapshot, createModuleRuntime } from '../../runtime/module-session';
import ModuleClientEntry from '../client-entry';
import { getLayoutScopeRegistry } from '../../../layout/runtime/server-layout';

/** The plugin supplies the static client entry and generateMetadata without serializing classes. */
export function withModule(load: ModuleLoader, moduleId?: string, managedMetadata = true) {
  if (!moduleId)
    throw new Error(
      'withModule() требует подключения withApp() и загрузчика вида () => import(...) со строковым литералом.',
    );

  const prepare = cache(async (paramsJson: string, searchJson: string) => {
    await connection();
    const app = await getApplication();
    const params = JSON.parse(paramsJson) as Record<string, unknown>;
    const searchParams = JSON.parse(searchJson) as Record<string, unknown>;
    const id = randomUUID();
    const parent = await (await getLayoutScopeRegistry()).parentFor(moduleId, params);
    const session = createModuleRuntime(app, load, id, { parent });
    try {
      await session.runtime.load({ params, props: { searchParams }, signal: session.abort.signal });
      session.runtime.commit();
      const snapshot = captureModuleSnapshot(session.runtime, {
        managedMetadata,
        id,
        params,
        props: { searchParams },
        applicationMetadata: app.getDependency(MetadataServiceInterface).getSnapshot(),
      });
      return {
        app,
        snapshot: {
          ...snapshot,
          resolvedMetadata: composeMetadata(
            {
              application: snapshot.applicationMetadata ?? {},
              page: snapshot.metadata ?? {},
              frames: [],
            },
            app.metadataOptions,
          ),
        },
      };
    } catch (error) {
      session.abort.abort();
      await session.dispose();
      throw error;
    }
  });
  const resolve = async (props: ModulePageProps) =>
    prepare(serialize(await props.params), serialize(await props.searchParams));

  async function SellgarModulePage(props: ModulePageProps) {
    const { snapshot } = await resolve(props);
    return <ModuleClientEntry key={snapshot.id} moduleId={moduleId!} snapshot={snapshot} />;
  }

  return Object.assign(SellgarModulePage, {
    generateMetadata: async (props: ModulePageProps) => {
      const { app, snapshot } = await resolve(props);
      return composeMetadata(
        { application: snapshot.applicationMetadata ?? {}, page: snapshot.metadata ?? {}, frames: [] },
        app.metadataOptions,
      );
    },
  });
}

const serialize = (values: Record<string, unknown> = {}): string =>
  JSON.stringify(Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))));
