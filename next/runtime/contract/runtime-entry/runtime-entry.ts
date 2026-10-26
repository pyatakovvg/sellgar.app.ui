import type { ModuleMetadata } from '../../../../react/module/declaration/module';
import type { LayoutMetadata } from '../../../../react/layout/declaration/layout';
import type { ModuleLoader } from '../../../module/contract/module-snapshot';

export type RuntimeEntryKind = 'module' | 'layout';

export type RuntimeEntryPresentation =
  | { readonly kind: 'module'; readonly metadata: ModuleMetadata }
  | { readonly kind: 'layout'; readonly metadata: LayoutMetadata };

export interface RuntimeEntryRegistration {
  readonly kind: RuntimeEntryKind;
  readonly load: ModuleLoader;
  readonly parentId?: string;
  readonly paramKeys: readonly string[];
}
