import React from 'react';

import type { DependencyConstructor } from '../../../../../core/di/binding/binding-builder';
import { NavigateServiceInterface } from '../../../../../core/router/service/navigate-service';
import type { RouterRuntime } from '../../../../../core/router/runtime/router-runtime';
import type { ResolvedApplicationRouting } from '../../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../../module/declaration/module';
import { RuntimeScopeProvider } from '../../../../runtime/scope/runtime-scope-context';
import { RuntimeErrorBoundary } from '../../../../runtime/exception/runtime-error-boundary';
import { getRouterPresentationDefinition } from '../../../declaration/router';
import type { ShellInterface } from '../../../declaration/shell';

interface IProps {
  readonly children: React.ReactNode;
  readonly exception: React.ReactNode;
  readonly routing: ResolvedApplicationRouting | null;
  readonly runtime: RouterRuntime<ModuleMetadata>;
}

const shellInstances = new WeakMap<RouterRuntime<ModuleMetadata>, ShellInterface>();

export const NestedRouterHost: React.FC<IProps> = (props) => {
  const definition = getRouterPresentationDefinition(props.runtime.router);
  const shellConstructor = definition.shell ?? props.routing?.shell;

  if (!shellConstructor) {
    throw new Error('Вложенный Router требует локальный shell или app.routing({ shell }).');
  }

  const scope = props.runtime.getRouterScope();
  const shell = resolveShell(props.runtime, shellConstructor);
  const navigate = scope.get(NavigateServiceInterface);

  return (
    <RuntimeErrorBoundary
      exception={props.exception}
      onError={(error) => void props.runtime.failRender(error)}
      resetKeys={[props.runtime]}
    >
      <RuntimeScopeProvider scope={scope}>
        <ShellPresentation close={() => navigate.close()} content={props.children} shell={shell} />
      </RuntimeScopeProvider>
    </RuntimeErrorBoundary>
  );
};

interface ShellPresentationProps {
  readonly close: () => void | Promise<void>;
  readonly content: React.ReactNode;
  readonly shell: ShellInterface;
}

const ShellPresentation: React.FC<ShellPresentationProps> = (props) => {
  return <>{props.shell.render({ close: props.close, content: props.content, open: true })}</>;
};

const resolveShell = (
  runtime: RouterRuntime<ModuleMetadata>,
  constructor: DependencyConstructor<ShellInterface>,
): ShellInterface => {
  const current = shellInstances.get(runtime);

  if (current) {
    if (!(current instanceof constructor)) {
      throw new Error('Shell declaration активного Router изменилась после создания runtime.');
    }

    return current;
  }

  const scope = runtime.getRouterScope();

  if (!scope.hasOwn(constructor)) {
    scope.bindSelfSingleton(constructor);
  }

  const shell = scope.get(constructor);

  shellInstances.set(runtime, shell);

  return shell;
};
