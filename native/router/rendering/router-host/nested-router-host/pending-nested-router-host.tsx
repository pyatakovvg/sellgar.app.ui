import React from 'react';

import type { RouterDeclaration } from '../../../../../core/router/declaration/router';
import type { ResolvedApplicationRouting } from '../../../../application/config/application-configurator';
import { getRouterPresentationDefinition } from '../../../declaration/router';
import { getShellMetadata } from '../../../declaration/shell';
import { ShellHost } from '../../shell-host';
import { resolveNestedShell } from './nested-shell.ts';

interface PendingNestedRouterHostProps {
  readonly dismiss: () => void | Promise<void>;
  readonly fallback: React.ReactNode;
  readonly onPresentationComplete: () => void;
  readonly phase: 'dismissing' | 'hidden' | 'presenting' | 'visible';
  readonly router: RouterDeclaration;
  readonly routing: ResolvedApplicationRouting | null;
}

export const PendingNestedRouterHost: React.FC<PendingNestedRouterHostProps> = (props) => {
  const definition = getRouterPresentationDefinition(props.router);
  const shellConstructor = resolveNestedShell(definition.shell, props.routing?.shell);

  return (
    <ShellHost
      dismiss={props.dismiss}
      metadata={getShellMetadata(shellConstructor)}
      onPresentationComplete={props.onPresentationComplete}
      phase={props.phase}
    >
      {props.fallback}
    </ShellHost>
  );
};
