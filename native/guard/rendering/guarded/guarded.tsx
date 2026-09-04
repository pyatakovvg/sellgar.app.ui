import React from 'react';

import type { GuardDeclarations } from '../../../../core/guard/declaration/guard-declaration';
import { useGuard } from '../../hook/use-guard';

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
