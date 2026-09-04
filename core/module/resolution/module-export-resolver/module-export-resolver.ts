import type { ModuleRuntimeDefinition } from '../../contract/module-runtime-definition';

export type ModuleExports = Readonly<Record<string, unknown>>;

export interface ModuleExportResolverInterface<TPresentation = unknown> {
  resolve(moduleExports: ModuleExports): ModuleRuntimeDefinition<TPresentation>;
}
