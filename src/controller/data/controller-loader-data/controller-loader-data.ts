import type { DependencyToken } from '../../../di/token/dependency-token';

export interface ControllerLoaderDataEntry {
  readonly actionKey: string;
  readonly controller: DependencyToken<unknown>;
  readonly value: unknown;
}

export interface ControllerLoaderData {
  readonly actionKeys: ReadonlyMap<DependencyToken<unknown>, string>;
  readonly values: ReadonlyMap<DependencyToken<unknown>, unknown>;
}

export const createControllerLoaderData = (entries: readonly ControllerLoaderDataEntry[]): ControllerLoaderData => {
  const actionKeys = new Map<DependencyToken<unknown>, string>();
  const values = new Map<DependencyToken<unknown>, unknown>();

  for (const entry of entries) {
    actionKeys.set(entry.controller, entry.actionKey);
    values.set(entry.controller, entry.value);
  }

  return {
    actionKeys,
    values,
  };
};

export const mergeControllerLoaderData = (
  data: ControllerLoaderData,
  patch: ControllerLoaderData,
): ControllerLoaderData => {
  return {
    actionKeys: new Map([...data.actionKeys, ...patch.actionKeys]),
    values: new Map([...data.values, ...patch.values]),
  };
};

export const getControllerActionKey = (
  data: ControllerLoaderData,
  controller: DependencyToken<unknown>,
): string | undefined => {
  return data.actionKeys.get(controller);
};

export const createControllerActionKey = (controllerToken: DependencyToken<unknown>): string => {
  const registeredKey = controllerActionKeys.get(controllerToken);

  if (registeredKey) {
    return registeredKey;
  }

  const actionKey = `controller-action:${++controllerActionKeyCounter}`;

  controllerActionKeys.set(controllerToken, actionKey);

  return actionKey;
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

class ControllerActionKeyRegistry {
  private readonly objectKeys = new WeakMap<object, string>();
  private readonly primitiveKeys = new Map<string | symbol, string>();

  get(controllerToken: DependencyToken<unknown>): string | null {
    if (typeof controllerToken === 'string') {
      return this.primitiveKeys.get(controllerToken) ?? null;
    }

    if (typeof controllerToken === 'symbol') {
      return this.primitiveKeys.get(controllerToken) ?? null;
    }

    return this.objectKeys.get(controllerToken) ?? null;
  }

  set(controllerToken: DependencyToken<unknown>, actionKey: string): void {
    if (typeof controllerToken === 'string') {
      this.primitiveKeys.set(controllerToken, actionKey);
      return;
    }

    if (typeof controllerToken === 'symbol') {
      this.primitiveKeys.set(controllerToken, actionKey);
      return;
    }

    this.objectKeys.set(controllerToken, actionKey);
  }
}

const controllerActionKeys = new ControllerActionKeyRegistry();
let controllerActionKeyCounter = 0;
