import React from 'react';

import type { RouterDeclaration } from '../../../../../core/router/declaration/router';
import { NavigateServiceInterface } from '../../../../../core/router/service/navigate-service';
import type { RouterRuntime } from '../../../../../core/router/runtime/router-runtime';
import type { ResolvedApplicationRouting } from '../../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../../module/declaration/module';
import { RuntimeScopeProvider, useRuntimeScope } from '../../../../runtime/scope/runtime-scope-context';
import { RuntimeErrorBoundary } from '../../../../runtime/exception/runtime-error-boundary';
import { getRouterPresentationDefinition } from '../../../declaration/router';
import { getShellMetadata } from '../../../declaration/shell';
import { ShellHost } from '../../shell-host';
import { resolveNestedShell } from './nested-shell.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly dismissPending: () => void | Promise<void>;
  readonly exception: React.ReactNode;
  readonly onPresentationComplete: () => void;
  readonly phase: 'dismissing' | 'hidden' | 'presenting' | 'visible';
  readonly router: RouterDeclaration;
  readonly routing: ResolvedApplicationRouting | null;
  readonly runtime: RouterRuntime<ModuleMetadata> | null;
}

export const NestedRouterHost: React.FC<IProps> = (props) => {
  const parentScope = useRuntimeScope();
  const definition = getRouterPresentationDefinition(props.router);
  const shellConstructor = resolveNestedShell(definition.shell, props.routing?.shell);
  const scope = props.runtime?.getRouterScope() ?? parentScope;
  const shell = getShellMetadata(shellConstructor);
  const dismiss = React.useCallback(() => {
    if (!props.runtime) return props.dismissPending();

    return props.runtime.getRouterScope().get(NavigateServiceInterface).close();
  }, [props.dismissPending, props.runtime]);
  const handleError = React.useCallback(
    (error: unknown) => {
      if (props.runtime) void props.runtime.failRender(error);
    },
    [props.runtime],
  );

  return (
    <RuntimeErrorBoundary exception={props.exception} onError={handleError} resetKeys={[props.runtime]}>
      <RuntimeScopeProvider scope={scope}>
        <ShellHost
          dismiss={dismiss}
          metadata={shell}
          onPresentationComplete={props.onPresentationComplete}
          phase={props.phase}
        >
          {props.children}
        </ShellHost>
      </RuntimeScopeProvider>
    </RuntimeErrorBoundary>
  );
};
