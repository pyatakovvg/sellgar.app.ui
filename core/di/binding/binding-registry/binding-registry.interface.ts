import type { DependencyToken } from '../../token/dependency-token';
import type { BindingBuilderInterface } from '../binding-builder';

export abstract class BindingRegistryInterface {
  abstract bind<TValue>(token: DependencyToken<TValue>): BindingBuilderInterface<TValue>;
}
