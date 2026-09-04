import type { DependencyToken } from '../../../di/token/dependency-token';

import type { ProviderInterface } from '../provider';

export type ProviderToken<TProps extends object = object> = DependencyToken<ProviderInterface<TProps>>;
