import React from 'react';

import { NavigateServiceInterface } from '../../../../../core/router/service/navigate-service';
import type { RouterRuntime } from '../../../../../core/router/runtime/router-runtime';
import type { ResolvedApplicationRouting } from '../../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../../module/declaration/module';
import { RuntimeScopeProvider } from '../../../../runtime/scope/runtime-scope-context';
import { RuntimeErrorBoundary } from '../../../../runtime/exception/runtime-error-boundary';
import { getRouterPresentationDefinition } from '../../../declaration/router';
import { getShellMetadata } from '../../../declaration/shell';
import { ShellHost } from '../../shell-host';
import { resolveNestedShell } from './nested-shell.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly exception: React.ReactNode;
  readonly onPresentationComplete: () => void;
  readonly phase: 'dismissing' | 'presenting' | 'visible';
  readonly presentationRevision: number | null;
  readonly routing: ResolvedApplicationRouting | null;
  readonly runtime: RouterRuntime<ModuleMetadata>;
}

export const NestedRouterHost: React.FC<IProps> = (props) => {
  const definition = getRouterPresentationDefinition(props.runtime.router);
  const shellConstructor = resolveNestedShell(definition.shell, props.routing?.shell);

  const scope = props.runtime.getRouterScope();
  const navigate = scope.get(NavigateServiceInterface);
  const shell = getShellMetadata(shellConstructor);
  const dismiss = React.useCallback(() => navigate.close(), [navigate]);

  return (
    <RuntimeErrorBoundary
      exception={props.exception}
      onError={(error) => void props.runtime.failRender(error)}
      resetKeys={[props.runtime]}
    >
      <RuntimeScopeProvider scope={scope}>
        <ShellHost
          dismiss={dismiss}
          metadata={shell}
          onPresentationComplete={props.onPresentationComplete}
          phase={props.phase}
          presentationRevision={props.presentationRevision}
        >
          {props.children}
        </ShellHost>
      </RuntimeScopeProvider>
    </RuntimeErrorBoundary>
  );
};
