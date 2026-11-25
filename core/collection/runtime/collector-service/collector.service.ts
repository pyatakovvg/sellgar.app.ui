import { Inject, Injectable } from '../../../di/injection/decorators';
import type { CollectorServiceInterface } from '../../service/collector-service';
import { CollectorContext } from '../collector-context';
import type { CollectorRegistry } from '../collector-registry';

@Injectable()
export class CollectorService implements CollectorServiceInterface {
  private registry: CollectorRegistry | undefined;

  constructor(@Inject(CollectorContext) context: CollectorContext) {
    this.registry = context.registry;
    context.owner.own({
      revoke: () => {
        this.registry = undefined;
      },
    });
  }

  reset(key: string): void {
    if (!this.registry) throw new Error('Collector service owner has been released.');

    this.registry.reset(key);
  }
}
