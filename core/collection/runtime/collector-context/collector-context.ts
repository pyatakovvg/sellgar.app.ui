import type { ControllerResourceLifetime } from '../../../runtime/controller/controller-resources';
import type { CollectorRegistry } from '../collector-registry';

export abstract class CollectorContext {
  abstract readonly owner: ControllerResourceLifetime;
  abstract readonly registry: CollectorRegistry;
  abstract readonly key: string | undefined;
}
