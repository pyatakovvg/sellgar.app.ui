import type { DependencyToken } from '../../di/token/dependency-token';

export type RuntimeOwner =
  | { readonly kind: 'application' }
  | { readonly id: string; readonly kind: 'route' }
  | { readonly kind: 'module'; readonly token: DependencyToken<unknown> }
  | {
      readonly instanceId: string;
      readonly kind: 'widget';
      readonly token: DependencyToken<unknown>;
    }
  | {
      readonly instanceId: string;
      readonly kind: 'frame';
      readonly token: DependencyToken<unknown>;
    };

export type RuntimeParticipant =
  | { readonly kind: 'initializer'; readonly token: DependencyToken<unknown> }
  | { readonly kind: 'policy'; readonly token: DependencyToken<unknown> }
  | { readonly kind: 'controller'; readonly token: DependencyToken<unknown> }
  | { readonly kind: 'provider'; readonly token: DependencyToken<unknown> }
  | { readonly kind: 'singleton-provider'; readonly token: DependencyToken<unknown> }
  | { readonly kind: 'event-handler'; readonly token: DependencyToken<unknown> }
  | { readonly kind: 'revalidate-handler'; readonly token: DependencyToken<unknown> }
  | { readonly kind: 'disposable' }
  | { readonly kind: 'runtime' };

export interface RuntimeFailureSource {
  readonly operation: string;
  readonly owner: RuntimeOwner;
  readonly participant: RuntimeParticipant;
}

export type RuntimeFailureDisposition =
  | 'application.activation-failed'
  | 'route.activation-failed'
  | 'module.activation-failed'
  | 'widget.failed'
  | 'frame.failed'
  | 'action.failed'
  | 'revalidate.failed'
  | 'event-handler.contained'
  | 'cleanup.contained';

export interface RuntimeFailureHop {
  readonly at: number;
  readonly disposition: RuntimeFailureDisposition;
  readonly owner: RuntimeOwner;
}

export interface RuntimeFailure {
  readonly cause: unknown;
  readonly createdAt: number;
  readonly id: string;
  readonly propagation: readonly RuntimeFailureHop[];
  readonly source: RuntimeFailureSource;
}

export interface RuntimeFailureReport {
  readonly disposition: RuntimeFailureDisposition;
  readonly failure: RuntimeFailure;
  readonly ownerState: string;
  readonly reportedAt: number;
}

export abstract class RuntimeFailureSinkInterface {
  abstract report(report: RuntimeFailureReport): void | Promise<void>;
}

export abstract class RuntimeFailureReporterInterface {
  abstract report(report: RuntimeFailureReport): void | Promise<void>;
}

let failureSequence = 0;
let runtimeInstanceSequence = 0;

export const createRuntimeFailure = (cause: unknown, source: RuntimeFailureSource): RuntimeFailure => {
  const createdAt = Date.now();

  return {
    cause,
    createdAt,
    id: `runtime-failure:${createdAt}:${++failureSequence}`,
    propagation: [],
    source,
  };
};

export const propagateRuntimeFailure = (
  failure: RuntimeFailure,
  owner: RuntimeOwner,
  disposition: RuntimeFailureDisposition,
): RuntimeFailure => {
  return {
    ...failure,
    propagation: [
      ...failure.propagation,
      {
        at: Date.now(),
        disposition,
        owner,
      },
    ],
  };
};

export const createRuntimeFailureReport = (
  failure: RuntimeFailure,
  owner: RuntimeOwner,
  disposition: RuntimeFailureDisposition,
  ownerState: string,
): RuntimeFailureReport => {
  return {
    disposition,
    failure: propagateRuntimeFailure(failure, owner, disposition),
    ownerState,
    reportedAt: Date.now(),
  };
};

export const reportRuntimeFailure = async (
  reporter: RuntimeFailureReporterInterface,
  failure: RuntimeFailure,
  owner: RuntimeOwner,
  disposition: RuntimeFailureDisposition,
  ownerState: string,
): Promise<void> => {
  try {
    await reporter.report(createRuntimeFailureReport(failure, owner, disposition, ownerState));
  } catch (cause) {
    globalThis.console.error({
      cause,
      failedRuntimeFailureReporter: true,
      runtimeFailureId: failure.id,
    });
  }
};

export const createRuntimeInstanceId = (kind: 'frame' | 'widget'): string => {
  return `${kind}:${++runtimeInstanceSequence}`;
};
