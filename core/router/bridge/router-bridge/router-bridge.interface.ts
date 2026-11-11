import type { NavigateServiceInterface } from '../../service/navigate-service';
import type { NavigationRequest } from '../../service/navigation-request';
import type { RouterDeclaration } from '../../declaration/router';
import type { NavigationState } from '../../runtime/navigation-state';

export interface RouterBridgeLocationInterface {
  readonly address: readonly string[];
  readonly entryId?: string;
  readonly nested: {
    readonly address: readonly string[];
    readonly query: Readonly<Record<string, unknown>>;
  } | null;
  readonly query: Readonly<Record<string, unknown>>;
  readonly revalidate?: boolean;
  readonly state: unknown;
}

export type RouterBridgeNavigationSource = 'external' | 'internal';

export type RouterBridgeLocationAction = 'apply' | 'preserve';

export type RouterBridgeRuntimeRetention = 'release' | 'retain';

export type RouterBridgeHistoryAction = 'pop' | 'push' | 'replace' | 'reset' | 'update';

export interface RouterBridgeHistoryEntryInterface {
  readonly action: RouterBridgeHistoryAction;
  readonly id: string;
  readonly index: number;
  readonly length: number;
}

export interface RouterBridgeRestoreContextInterface {
  readonly blockersConfirmed: boolean;
}

export interface RouterBridgeInitializeContextInterface {
  readonly back: () => Promise<boolean>;
  readonly cancelNavigation: () => boolean;
  readonly confirm: (location: RouterBridgeLocationInterface, signal: AbortSignal) => Promise<boolean>;
  readonly navigate: NavigateServiceInterface;
  /** Execute a token-based request as external navigation through the core lifecycle. */
  readonly navigateRequest: (request: NavigationRequest) => Promise<boolean>;
  readonly restore: (
    location: RouterBridgeLocationInterface,
    context: RouterBridgeRestoreContextInterface,
  ) => Promise<boolean>;
  readonly router: RouterDeclaration;
  readonly shouldBlockUnload: () => boolean;
  readonly signal: AbortSignal;
}

export interface RouterBridgeCommitContextInterface {
  readonly history: RouterBridgeHistoryEntryInterface;
  /** Preserve the attempted external location, or apply the complete resolved navigation target. */
  readonly locationAction: RouterBridgeLocationAction;
  readonly signal: AbortSignal;
  readonly source: RouterBridgeNavigationSource;
}

export interface RouterBridgeInterface {
  readonly runtimeRetention: RouterBridgeRuntimeRetention;

  back(): void | Promise<void>;

  initialize(context: RouterBridgeInitializeContextInterface): void | Promise<void>;

  commit(navigation: NavigationState, context: RouterBridgeCommitContextInterface): void | Promise<void>;

  dispose(): void | Promise<void>;
}

export interface RouterBridgeHrefCapabilityInterface {
  createHref(navigation: NavigationState): string;
}

export const hasRouterBridgeHrefCapability = (
  bridge: RouterBridgeInterface,
): bridge is RouterBridgeInterface & RouterBridgeHrefCapabilityInterface => {
  return 'createHref' in bridge && typeof bridge.createHref === 'function';
};
