import React from 'react';
import { useRevalidator } from 'react-router';

import type { DependencyToken } from '../../../di/token/dependency-token';
import { useDependency } from '../../../runtime/react';
import { RevalidateServiceInterface } from '../../contract/revalidate-service';

export interface RevalidateBridgeProps {
  readonly children?: React.ReactNode;
  readonly controllerTokens?: readonly DependencyToken<unknown>[];
  readonly fallback?: boolean;
  readonly revalidate?: (controllerToken?: DependencyToken<unknown>) => void | Promise<void>;
}

export const RevalidateBridge: React.FC<RevalidateBridgeProps> = ({
  children,
  controllerTokens = [],
  fallback = false,
  revalidate,
}) => {
  const revalidator = useRevalidator();
  const revalidateService = useDependency(RevalidateServiceInterface);
  const pendingResolversRef = React.useRef<Array<() => void>>([]);

  React.useEffect(() => {
    if (revalidator.state !== 'idle') {
      return;
    }

    const resolvers = pendingResolversRef.current;

    if (resolvers.length === 0) {
      return;
    }

    pendingResolversRef.current = [];
    resolvers.forEach((resolve) => {
      resolve();
    });
  }, [revalidator.state]);

  const handleRevalidate = React.useCallback(
    (controllerToken?: DependencyToken<unknown>) => {
      if (revalidate !== undefined) {
        return Promise.resolve(revalidate(controllerToken));
      }

      return new Promise<void>((resolve) => {
        pendingResolversRef.current.push(resolve);

        const result = revalidator.revalidate();

        if (result && typeof result === 'object' && 'catch' in result && typeof result.catch === 'function') {
          result.catch(() => {
            resolve();
          });
        }
      });
    },
    [revalidate, revalidator],
  );

  React.useEffect(() => {
    return () => {
      const resolvers = pendingResolversRef.current;

      pendingResolversRef.current = [];
      resolvers.forEach((resolve) => {
        resolve();
      });
    };
  }, []);

  React.useEffect(() => {
    if (!fallback) {
      return;
    }

    const handler = () => handleRevalidate();

    revalidateService.registerFallback(handler);

    return () => {
      revalidateService.unregisterFallback(handler);
    };
  }, [fallback, handleRevalidate, revalidateService]);

  React.useEffect(() => {
    const handlers = controllerTokens.map((controllerToken) => {
      const handler = () => handleRevalidate(controllerToken);

      revalidateService.register(controllerToken, handler);

      return {
        controllerToken,
        handler,
      };
    });

    return () => {
      handlers.forEach(({ controllerToken, handler }) => {
        revalidateService.unregister(controllerToken, handler);
      });
    };
  }, [controllerTokens, handleRevalidate, revalidateService]);

  return <>{children}</>;
};
