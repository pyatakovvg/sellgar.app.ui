import type { RouterHashOptions } from '../../utils/hash-utils';
import type { RouterSearchUpdateOptions } from '../../utils/search-utils';
import type { RouterHashObject } from '../../utils/hash-utils';
import type { RouterSearchObject } from '../../utils/search-utils';

export interface RouterNavigateOptions {
  readonly replace?: boolean;
  readonly state?: unknown;
}

export interface RouterHashNavigateOptions extends RouterHashOptions {
  readonly merge?: boolean;
  readonly replace?: boolean;
  readonly state?: unknown;
}

export interface RouterSearchNavigateOptions extends RouterSearchUpdateOptions {
  readonly merge?: boolean;
  readonly replace?: boolean;
}

export abstract class NavigateServiceInterface {
  abstract back(): Promise<void>;

  abstract hashParams(to: RouterHashObject, options?: RouterHashNavigateOptions): Promise<void>;

  abstract replace(to: string, options?: Omit<RouterNavigateOptions, 'replace'>): Promise<void>;

  abstract searchParams(to: RouterSearchObject, options?: RouterSearchNavigateOptions): Promise<void>;

  abstract to(to: string, options?: RouterNavigateOptions): Promise<void>;
}
