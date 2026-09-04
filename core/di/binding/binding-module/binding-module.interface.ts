import type { BindingRegistryInterface } from '../binding-registry';

export abstract class BindingModuleInterface {
  abstract register(registry: BindingRegistryInterface): void;
}

export type BindingModuleConstructor = new () => BindingModuleInterface;
