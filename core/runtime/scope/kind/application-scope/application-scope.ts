import { SessionRuntimeStateInterface } from '../../../../application/session/session-runtime-state';
import { RequestExecutor, RequestExecutorInterface } from '../../../../application/request/request-executor';
import { DisposableRegistryInterface } from '../../../../application/disposable/disposable-registry';
import { ConsoleRuntimeFailureSink } from '../../../../application/reporting/console-runtime-failure-sink';
import { RuntimeFailureReporter } from '../../../../application/reporting/runtime-failure-reporter';
import { NavigateServiceInterface } from '../../../../router/service/navigate-service';
import { ClassTransformerRouterParamsConverter } from '../../../../router/params/class-transformer-router-params-converter';
import { RouterParamsConverterInterface } from '../../../../router/params/router-params-converter';
import { ApplicationLocationService, LocationServiceInterface } from '../../../../router/service/location-service';
import {
  ApplicationRouteQueryService,
  RouteQueryServiceInterface,
} from '../../../../router/service/route-query-service';
import type { NavigationState } from '../../../../router/runtime/navigation-state';
import { RuntimeFailureReporterInterface, RuntimeFailureSinkInterface } from '../../../failure/runtime-failure';
import { RuntimeExceptionService, RuntimeExceptionServiceInterface } from '../../../exception/runtime-exception';
import { RuntimeOperationCoordinator } from '../../../operation/runtime-operation-coordinator';
import { RuntimeScope } from '../../base/runtime-scope';
import { ProviderScope } from '../provider-scope';
import { WidgetRuntimeRegistry } from '../../../../widget/runtime/widget-runtime-registry';
import { WidgetPreloader, WidgetPreloaderInterface } from '../../../../widget/service/widget-preloader';

export class ApplicationScope extends RuntimeScope {
  private readonly paramsConverter = new ClassTransformerRouterParamsConverter();
  private readonly location = new ApplicationLocationService(this.paramsConverter);
  private readonly query = new ApplicationRouteQueryService();
  private readonly providerScope: ProviderScope;
  private readonly widgetRuntimeRegistry = new WidgetRuntimeRegistry();

  constructor() {
    super();

    this.providerScope = new ProviderScope(this);

    this.register((registry) => {
      registry.bind(ProviderScope).toConstantValue(this.providerScope);
      registry.bind(RouterParamsConverterInterface).toConstantValue(this.paramsConverter);
      registry.bind(LocationServiceInterface).toConstantValue(this.location);
      registry.bind(ApplicationRouteQueryService).toConstantValue(this.query);
      registry.bind(RouteQueryServiceInterface).toConstantValue(this.query);
      registry.bind(RuntimeFailureReporterInterface).to(RuntimeFailureReporter).inSingletonScope();
      registry.bind(RuntimeFailureSinkInterface).to(ConsoleRuntimeFailureSink).inSingletonScope();
      registry.bind(RuntimeExceptionServiceInterface).to(RuntimeExceptionService).inSingletonScope();
      registry.bind(RequestExecutor).toSelf().inSingletonScope();
      registry.bind(RequestExecutorInterface).toService(RequestExecutor);
      registry.bind(WidgetRuntimeRegistry).toConstantValue(this.widgetRuntimeRegistry);
      registry.bind(WidgetPreloaderInterface).toConstantValue(new WidgetPreloader(this.widgetRuntimeRegistry));
    });
  }

  disposeWidgetRuntimes(): Promise<void> {
    return this.widgetRuntimeRegistry.dispose();
  }

  disposeProviders(): Promise<void> {
    return this.providerScope.disposeProviders();
  }

  bindSession(session: SessionRuntimeStateInterface): void {
    this.register((registry) => {
      registry.bind(SessionRuntimeStateInterface).toConstantValue(session);
      registry.bind(RuntimeOperationCoordinator).toConstantValue(new RuntimeOperationCoordinator(session));
    });
  }

  bindNavigate(navigate: NavigateServiceInterface): void {
    this.register((registry) => {
      registry.bind(NavigateServiceInterface).toConstantValue(navigate);
    });
  }

  bindDisposables(disposables: DisposableRegistryInterface): void {
    this.register((registry) => {
      registry.bind(DisposableRegistryInterface).toConstantValue(disposables);
    });
  }

  syncLocation(navigation: NavigationState): void {
    this.location.sync(navigation);
    this.query.sync(navigation);
  }
}
