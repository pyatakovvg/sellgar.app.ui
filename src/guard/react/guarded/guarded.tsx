import React from 'react';

import { useGuard } from '../use-guard';

import type { GuardDeclarations } from '../../declaration/guard-declaration';

export interface GuardedProps<TContext = void> {
  readonly by: GuardDeclarations<TContext>;
  readonly children: React.ReactNode;
  readonly context?: TContext;
  readonly fallback?: React.ReactNode;
}

export function Guarded<TContext = void>({
  by,
  children,
  context = void 0 as TContext,
  fallback = null,
}: GuardedProps<TContext>): React.ReactElement | null {
  const isAllowed = useGuard(by, context);

  return <>{isAllowed ? children : fallback}</>;
}
