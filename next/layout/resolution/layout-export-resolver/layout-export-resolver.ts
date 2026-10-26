import { createModuleRuntimeDefinition } from '../../../../core/module/contract/module-runtime-definition';
import type {
  ModuleExportResolverInterface,
  ModuleExports,
} from '../../../../core/module/resolution/module-export-resolver';
import {
  getLayoutMetadata,
  isLayoutConstructor,
  type LayoutMetadata,
} from '../../../../react/layout/declaration/layout';

export class LayoutExportResolver implements ModuleExportResolverInterface<LayoutMetadata> {
  resolve(exports: ModuleExports) {
    const layouts = Object.values(exports).filter(isLayoutConstructor);
    if (layouts.length !== 1)
      throw new Error('Пакет layout для Next должен экспортировать ровно один класс с @Layout().');
    const token = layouts[0]!;
    const metadata = getLayoutMetadata(token);
    return createModuleRuntimeDefinition({ token, presentation: metadata, providers: metadata.providers });
  }
}
