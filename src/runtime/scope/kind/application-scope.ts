import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { RequestExecutor, RequestExecutorInterface } from '../../../application/request';
import { ConsoleRuntimeFailureSink } from '../../../application/reporting/console-runtime-failure-sink';
import { RuntimeFailureReporter } from '../../../application/reporting/runtime-failure-reporter';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { RuntimeFailureReporterInterface, RuntimeFailureSinkInterface } from '../../failure';
import { RuntimeOperationCoordinator } from '../../operation';
import { RuntimeExceptionService, RuntimeExceptionServiceInterface } from '../../exception';

import { RuntimeScope } from '../base';

import { ProviderScope } from './provider-scope.ts';

export class ApplicationScope extends RuntimeScope {
  private readonly providerScope: ProviderScope;

  constructor() {
    super();

    this.providerScope = new ProviderScope(this);

    this.register((registry) => {
      registry.bind(ProviderScope).toConstantValue(this.providerScope);
      registry.bind(RuntimeFailureReporterInterface).to(RuntimeFailureReporter).inSingletonScope();
      registry.bind(RuntimeFailureSinkInterface).to(ConsoleRuntimeFailureSink).inSingletonScope();
      registry.bind(RuntimeExceptionServiceInterface).to(RuntimeExceptionService).inSingletonScope();
      registry.bind(RequestExecutor).toSelf().inSingletonScope();
      registry.bind(RequestExecutorInterface).toService(RequestExecutor);
    });
  }

  override dispose(): void {
    this.providerScope.dispose();
    super.dispose();
  }

  bindRouterRuntime(routerRuntime: RouterRuntime): void {
    this.register((registry) => {
      registry.bind(RouterRuntime).toConstantValue(routerRuntime);
    });
  }

  bindSession(session: SessionRuntimeStateInterface): void {
    this.register((registry) => {
      registry.bind(SessionRuntimeStateInterface).toConstantValue(session);
      registry.bind(RuntimeOperationCoordinator).toConstantValue(new RuntimeOperationCoordinator(session));
    });
  }
}
