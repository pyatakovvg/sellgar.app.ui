import type { DependencyToken } from '../../../di/token/dependency-token';

export interface ControllerLoaderDataEntry {
  readonly controller: DependencyToken<unknown>;
  readonly value: unknown;
}

export interface ControllerLoaderData {
  readonly values: ReadonlyMap<DependencyToken<unknown>, unknown>;
}

export const createControllerLoaderData = (entries: readonly ControllerLoaderDataEntry[]): ControllerLoaderData => {
  const values = new Map<DependencyToken<unknown>, unknown>();

  for (const entry of entries) {
    values.set(entry.controller, entry.value);
  }

  return {
    values,
  };
};

export const mergeControllerLoaderData = (
  data: ControllerLoaderData,
  patch: ControllerLoaderData,
): ControllerLoaderData => {
  return {
    values: new Map([...data.values, ...patch.values]),
  };
};

export const getControllerLoaderData = <TValue>(
  data: ControllerLoaderData,
  controller: DependencyToken<unknown>,
): TValue => {
  if (!data.values.has(controller)) {
    throw new Error('Данные загрузчика контроллера недоступны.');
  }

  return data.values.get(controller) as TValue;
};
