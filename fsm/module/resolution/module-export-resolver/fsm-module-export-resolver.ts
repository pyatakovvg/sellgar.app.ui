import { createModuleRuntimeDefinition } from '../../../../core/module/contract/module-runtime-definition';
import type {
  ModuleExportResolverInterface,
  ModuleExports,
} from '../../../../core/module/resolution/module-export-resolver';
import { getLayoutMetadata } from '../../../layout/declaration/layout';
import {
  getModuleMetadata,
  isModuleConstructor,
  type ModuleConstructor,
  type ModuleMetadata,
} from '../../declaration/module';

type ModuleExportEntry = [string, ModuleConstructor];

export class FsmModuleExportResolver implements ModuleExportResolverInterface<ModuleMetadata> {
  resolve(moduleExports: ModuleExports) {
    const module = resolveFsmModuleExport(moduleExports);
    const metadata = getModuleMetadata(module);
    const layouts = metadata.layouts ?? [];

    return createModuleRuntimeDefinition({
      bindingOwners: layouts,
      presentation: metadata,
      providers: [
        ...(metadata.providers ?? []),
        ...layouts.flatMap((layout) => getLayoutMetadata(layout).providers ?? []),
      ],
      token: module,
    });
  }
}

const resolveFsmModuleExport = (moduleExports: ModuleExports): ModuleConstructor => {
  const candidates = Object.entries(moduleExports).filter((entry): entry is ModuleExportEntry => {
    return isModuleConstructor(entry[1]);
  });

  if (candidates.length === 1) {
    return candidates[0]![1];
  }

  const exportedNames = Object.keys(moduleExports).join(', ') || '(empty)';

  if (candidates.length === 0) {
    throw new Error(`Экспорт FSM Module не найден. Экспорты: ${exportedNames}.`);
  }

  throw new Error('Пакет должен экспортировать ровно один класс FSM @Module.');
};
