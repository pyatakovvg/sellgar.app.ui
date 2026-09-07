import {
  BackServiceInterface,
  type BackCondition,
  type BackHandler,
  type BackInterception,
} from '../../service/back-service';
import type { BackBoundary } from './back-boundary.ts';
import type { BackRuntimeInterface } from './back-runtime.interface.ts';

export class BackService extends BackServiceInterface {
  private readonly interceptions = new Set<BackInterception>();

  constructor(
    private readonly runtime: BackRuntimeInterface,
    private readonly boundary: BackBoundary,
  ) {
    super();
  }

  intercept(condition: BackCondition, handler: BackHandler): BackInterception {
    const interception = this.runtime.register(this.boundary, condition, handler);
    let active = true;
    const ownedInterception = Object.freeze({
      dispose: () => {
        if (!active) return;

        active = false;
        this.interceptions.delete(ownedInterception);
        interception.dispose();
      },
    });

    this.interceptions.add(ownedInterception);
    return ownedInterception;
  }

  dispose(): void {
    for (const interception of [...this.interceptions]) {
      interception.dispose();
    }
  }
}
