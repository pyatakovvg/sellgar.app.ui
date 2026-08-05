import type { DependencyToken } from '../../di/token/dependency-token';

import type { RuntimeProviderInterface } from './runtime-provider';
import type { SingletonProviderInterface } from './singleton-provider';

export type ProviderToken<TProps extends object = object> = DependencyToken<
  RuntimeProviderInterface<TProps> | SingletonProviderInterface
>;
