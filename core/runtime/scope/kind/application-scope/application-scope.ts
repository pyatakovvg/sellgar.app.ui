import { SessionRuntimeStateInterface } from '../../../../application/session/session-runtime-state';
import {
  type ApplicationFeatureInterface,
  type ApplicationFeatureToken,
  isApplicationFeatureToken,
} from '../../../../application/feature/application-feature';
import { RequestExecutor, RequestExecutorInterface } from '../../../../application/request/request-executor';
import { DisposableRegistryInterface } from '../../../../application/disposable/disposable-registry';
import {
  type ApplicationReportHandlerInterface,
  ApplicationReportDispatcherInterface,
  type ApplicationReporterDeclaration,
  ApplicationReporterInterface,
} from '../../../../application/reporting/application-report';
import { ApplicationReporter } from '../../../../application/reporting/application-reporter';
import { isReporterToken } from '../../../../application/reporting/reporter';
import { NavigateServiceInterface } from '../../../../router/service/navigate-service';
import { ClassTransformerRouterParamsConverter } from '../../../../router/params/class-transformer-router-params-converter';
import { RouterParamsConverterInterface } from '../../../../router/params/router-params-converter';
import { ApplicationLocationService, LocationServiceInterface } from '../../../../router/service/location-service';
import {
  ApplicationRouteQueryService,
  RouteQueryServiceInterface,
} from '../../../../router/service/route-query-service';
import type { NavigationState } from '../../../../router/runtime/navigation-state';
import { RuntimeExceptionService, RuntimeExceptionServiceInterface } from '../../../exception/runtime-exception';
import { RuntimeOperationCoordinator } from '../../../operation/runtime-operation-coordinator';
import { RuntimeScope } from '../../base/runtime-scope';
import { ProviderScope } from '../provider-scope';
import { RevalidateServiceInterface } from '../../../../revalidate/contract/revalidate-service';
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
      registry.bind(ApplicationReporter).toSelf().inSingletonScope();
      registry.bind(ApplicationReporterInterface).toService(ApplicationReporter);
      registry.bind(ApplicationReportDispatcherInterface).toService(ApplicationReporter);
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

  activateReporters(reporters: readonly ApplicationReporterDeclaration[]): Promise<void> {
    for (const reporter of reporters) {
      if (!isReporterToken(reporter)) {
        throw new Error('Reporter class must be decorated with @Reporter().');
      }
    }

    for (const reporter of reporters) {
      this.activate(reporter);
    }

    this.register((registry) => {
      for (const reporter of reporters) {
        registry.bind(reporter).toSelf().inSingletonScope();
      }
    });

    const resolvedReporters = reporters.flatMap((declaration) => {
      try {
        return [
          {
            declaration,
            instance: this.get(declaration),
          },
        ];
      } catch (cause) {
        globalThis.console.error({
          cause,
          failedApplicationReporter: declaration.name,
          operation: 'resolve',
        });

        return [];
      }
    });

    const initialization = resolvedReporters.map(({ instance }) => {
      return Promise.resolve().then(() => instance.initialize?.());
    });

    return Promise.allSettled(initialization).then((results) => {
      const instances: ApplicationReportHandlerInterface[] = [];

      for (const [index, result] of results.entries()) {
        const reporter = resolvedReporters[index];

        if (!reporter) {
          continue;
        }

        if (result.status === 'fulfilled') {
          instances.push(reporter.instance);
          continue;
        }

        globalThis.console.error({
          cause: result.reason,
          failedApplicationReporter: reporter.declaration.name,
          operation: 'initialize',
        });
      }

      this.get(ApplicationReporter).activate(instances);
    });
  }

  activateFeatures(features: readonly ApplicationFeatureToken[]): readonly ApplicationFeatureInterface[] {
    const uniqueFeatures = new Set<ApplicationFeatureToken>();

    for (const feature of features) {
      if (!isApplicationFeatureToken(feature)) {
        throw new Error('Feature class must be decorated with @Feature().');
      }

      if (uniqueFeatures.has(feature)) {
        throw new Error(`Feature ${feature.name || '<anonymous>'} is registered more than once.`);
      }

      uniqueFeatures.add(feature);
    }

    for (const feature of features) {
      this.activate(feature, { collectControllerBindings: true });
    }

    this.register((registry) => {
      for (const feature of features) {
        registry.bind(feature).toSelf().inSingletonScope();
      }
    });

    return features.map((feature) => this.get(feature));
  }

  disposeReporters(): Promise<void> {
    return this.get(ApplicationReporter).dispose();
  }

  bindRevalidate(service: RevalidateServiceInterface): void {
    this.register((registry) => registry.bind(RevalidateServiceInterface).toConstantValue(service));
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
