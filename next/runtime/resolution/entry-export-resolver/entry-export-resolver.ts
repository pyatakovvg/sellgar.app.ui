import type {
  ModuleExportResolverInterface,
  ModuleExports,
} from '../../../../core/module/resolution/module-export-resolver';
import { ReactModuleExportResolver } from '../../../../react/module/resolution/module-export-resolver';
import { LayoutExportResolver } from '../../../layout/resolution/layout-export-resolver';
import type { RuntimeEntryKind, RuntimeEntryPresentation } from '../../contract/runtime-entry';

export class EntryExportResolver implements ModuleExportResolverInterface<RuntimeEntryPresentation> {
  constructor(private readonly kind: RuntimeEntryKind = 'module') {}

  resolve(exports: ModuleExports) {
    if (this.kind === 'layout') {
      const definition = new LayoutExportResolver().resolve(exports);
      return { ...definition, presentation: { kind: 'layout' as const, metadata: definition.presentation } };
    }
    const definition = new ReactModuleExportResolver().resolve(exports);
    return { ...definition, presentation: { kind: 'module' as const, metadata: definition.presentation } };
  }
}
