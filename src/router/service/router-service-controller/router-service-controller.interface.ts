import type { RouterHashObject } from '../../utils/hash-utils';
import type { RouterSearchObject } from '../../utils/search-utils';
import type { RouterLocationSnapshot } from '../location-service';
import type { RouterNavigateOptions } from '../navigate-service';

export interface RouterNavigator {
  back(): void | Promise<void>;

  navigate(to: string, options?: RouterNavigateOptions): void | Promise<void>;
}

export abstract class RouterServiceControllerInterface {
  abstract attachNavigator(navigator: RouterNavigator): () => void;

  abstract syncLocation(
    location: Omit<RouterLocationSnapshot, 'hashParams' | 'searchParams'> & {
      readonly hashParams?: RouterHashObject;
      readonly searchParams?: RouterSearchObject;
    },
  ): void;
}
