export type ProviderCleanup = () => void | Promise<void>;
export type ProviderResult = void | ProviderCleanup;

export interface ProviderOperationContextInterface {
  readonly signal: AbortSignal;
}

export type ProviderInitializeContextInterface = ProviderOperationContextInterface;
export type ProviderActivateContextInterface = ProviderOperationContextInterface;

export interface ProviderRuntimeContextInterface<
  TProps extends object = Record<string, never>,
> extends ProviderOperationContextInterface {
  readonly params: Readonly<Record<string, unknown>>;
  readonly props: Readonly<TProps>;
}

export type ProviderPrepareContextInterface<TProps extends object = Record<string, never>> =
  ProviderRuntimeContextInterface<TProps>;

export type ProviderRevalidationContextInterface<TProps extends object = Record<string, never>> =
  ProviderRuntimeContextInterface<TProps>;

export abstract class ProviderInterface<TProps extends object = never> {
  initialize?(context: ProviderInitializeContextInterface): ProviderResult | Promise<ProviderResult>;

  prepare?(context: ProviderPrepareContextInterface<TProps>): ProviderResult | Promise<ProviderResult>;

  activate?(context: ProviderActivateContextInterface): ProviderResult | Promise<ProviderResult>;

  revalidate?(context: ProviderRevalidationContextInterface<TProps>): void | Promise<void>;

  abstract dispose(): void | Promise<void>;
}
