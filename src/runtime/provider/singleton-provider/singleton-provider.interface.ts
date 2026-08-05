import type { RuntimeProviderResult } from '../runtime-provider';

export abstract class SingletonProviderInterface {
  abstract setup(): RuntimeProviderResult | Promise<RuntimeProviderResult>;
}
