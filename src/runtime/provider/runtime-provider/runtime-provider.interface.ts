import type { RuntimeScope } from '../../scope/base';

export type RuntimeProviderCleanup = () => void | Promise<void>;
export type RuntimeProviderResult = void | RuntimeProviderCleanup;

export type RuntimeProviderPhase = 'afterRender' | 'beforeLoad' | 'beforeRender' | 'onDemand' | 'setup';

export interface RuntimeExecutionContextInterface<TProps extends object = object> {
  readonly phase: RuntimeProviderPhase;
  readonly props: TProps;
  readonly scope: RuntimeScope;
  readonly signal: AbortSignal;
}

export interface RuntimeProviderContextInterface<
  TProps extends object = object,
> extends RuntimeExecutionContextInterface<TProps> {
  readonly params: Record<string, string | undefined>;
  readonly request: Request;
}

export abstract class RuntimeProviderInterface<TProps extends object = object> {
  setup?(context: RuntimeProviderContextInterface<TProps>): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  afterRender?(
    context: RuntimeProviderContextInterface<TProps>,
  ): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  beforeLoad?(context: RuntimeProviderContextInterface<TProps>): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  beforeRender?(
    context: RuntimeProviderContextInterface<TProps>,
  ): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  onDemand?(context: RuntimeProviderContextInterface<TProps>): RuntimeProviderResult | Promise<RuntimeProviderResult>;
}
