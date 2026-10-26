import type { ModuleExports } from '../../../../core/module/resolution/module-export-resolver';
import type { RuntimeEntryKind } from '../../../runtime/contract/runtime-entry';

export type ModuleLoader = () => Promise<ModuleExports>;

export interface ModulePageProps {
  readonly params?: Promise<Record<string, string | readonly string[] | undefined>>;
  readonly searchParams?: Promise<Record<string, string | readonly string[] | undefined>>;
}

export interface ModuleControllerSnapshot {
  readonly methods: readonly string[];
  readonly data: unknown;
}

/** Tokens and live instances never cross the RSC boundary. Registration order identifies controllers. */
export interface ModuleSnapshot {
  readonly kind?: RuntimeEntryKind;
  readonly id: string;
  readonly params: Record<string, unknown>;
  readonly props: { readonly searchParams: Record<string, unknown> };
  readonly controllers: readonly ModuleControllerSnapshot[];
}
