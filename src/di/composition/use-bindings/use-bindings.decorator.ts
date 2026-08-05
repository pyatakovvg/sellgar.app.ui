import type { BindingModuleConstructor } from '../../binding/binding-module';

export const USE_BINDINGS_METADATA_KEY = Symbol('tiyn-app:di:use-bindings');

export const UseBindings = (...bindings: BindingModuleConstructor[]): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(USE_BINDINGS_METADATA_KEY, bindings, constructor);
  };
};

export const getUseBindingsMetadata = (target: unknown): readonly BindingModuleConstructor[] => {
  const constructor = typeof target === 'function' ? target : target?.constructor;

  if (typeof constructor !== 'function') {
    return [];
  }

  const chain: object[] = [];
  let current: unknown = constructor;

  while (typeof current === 'function' && current !== Function.prototype) {
    chain.unshift(current);
    current = Object.getPrototypeOf(current);
  }

  return chain.flatMap((item) => {
    return (Reflect.getOwnMetadata(USE_BINDINGS_METADATA_KEY, item) as BindingModuleConstructor[] | undefined) ?? [];
  });
};
