import 'server-only';
import { cache } from 'react';
import { getApplication } from '../../../application/runtime/server-application';
import { LayoutScopeRegistry } from '../layout-scope-registry';
import { serverEntries } from '../server-layout-registry';

export const getLayoutScopeRegistry = cache(async () => new LayoutScopeRegistry(await getApplication(), serverEntries));
