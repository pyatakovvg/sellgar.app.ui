import { ContainerModule } from 'inversify';

import type { ControllerResourceContext } from '../../../runtime/controller/controller-resources';
import { getCollectorInjections } from '../../declaration/inject-collector';
import { CollectorServiceInterface } from '../../service/collector-service';
import { Collector, CollectorInterface } from '../collector';
import { CollectorContext } from '../collector-context';
import { CollectorRegistry } from '../collector-registry';
import { CollectorService } from '../collector-service';

export interface CollectorComposition {
  readonly module: ContainerModule;
  revoke(): void;
  dispose(): void;
}

export const createCollectorComposition = (
  constructors: readonly Function[],
  capture: () => ControllerResourceContext,
): CollectorComposition => {
  const registry = new CollectorRegistry();
  const injections = new Map(
    constructors.flatMap((constructor) =>
      getCollectorInjections(constructor).map((injection) => [injection.slot, injection]),
    ),
  );
  const module = new ContainerModule(({ bind }) => {
    for (const injection of injections.values()) {
      bind(CollectorInterface).to(Collector).inTransientScope().whenNamed(injection.slot);
      bind(CollectorContext)
        .toDynamicValue(() => {
          const { owner, controllerConstructor } = capture();

          if (controllerConstructor !== injection.constructor) {
            throw new Error('InjectCollector must belong to the controller being created by this runtime.');
          }

          return { owner, registry, key: injection.key };
        })
        .inTransientScope()
        .whenParentNamed(injection.slot);
    }

    bind(CollectorServiceInterface).to(CollectorService).inTransientScope();
    bind(CollectorContext)
      .toDynamicValue(() => ({ owner: capture().owner, registry, key: undefined }))
      .inTransientScope()
      .whenParentIs(CollectorServiceInterface);
  });

  return {
    module,
    revoke: () => registry.revoke(),
    dispose: () => registry.revoke(),
  };
};
