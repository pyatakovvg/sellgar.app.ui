import { isModuleConstructor, type ModuleConstructor } from '../../declaration/module';

type ModuleExportEntry = [string, ModuleConstructor];

export const resolveModuleExport = (moduleExports: Record<string, unknown>): ModuleConstructor => {
  const candidates = Object.entries(moduleExports).filter((entry): entry is ModuleExportEntry =>
    isModuleConstructor(entry[1]),
  );

  if (candidates.length === 1) {
    return candidates[0][1];
  }

  const exportedNames = Object.keys(moduleExports).join(', ') || '(empty)';

  if (candidates.length === 0) {
    throw new Error(`Экспорт route-модуля не найден. Экспорты: ${exportedNames}.`);
  }

  throw new Error('Route-модуль должен экспортировать ровно один класс @Module.');
};
