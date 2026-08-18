import type { RuntimeScope } from '../../../../runtime/scope/base';
import type { FrameRouter } from '../../declaration/frame-router';
import { FrameRouterRuntime } from '../frame-router-runtime';

type FrameRouterRuntimeMap = Map<string, FrameRouterRuntime>;

export class FrameRouterRuntimeRegistry {
  private readonly runtimes = new Map<FrameRouter, FrameRouterRuntimeMap>();

  collectInactiveExcept(activeRuntimeKeys: ReadonlyMap<FrameRouter, string>): FrameRouterRuntime[] {
    const inactiveRuntimes: FrameRouterRuntime[] = [];

    this.runtimes.forEach((runtimes, router) => {
      const activeRuntimeKey = activeRuntimeKeys.get(router);

      runtimes.forEach((runtime, runtimeKey) => {
        if (runtimeKey === activeRuntimeKey) {
          return;
        }

        runtimes.delete(runtimeKey);
        inactiveRuntimes.push(runtime);
      });

      if (runtimes.size === 0) {
        this.runtimes.delete(router);
      }
    });

    return inactiveRuntimes;
  }

  drain(): FrameRouterRuntime[] {
    const runtimes = [...this.runtimes.values()].flatMap((routerRuntimes) => [...routerRuntimes.values()]);

    this.runtimes.clear();

    return runtimes;
  }

  prepare(router: FrameRouter, runtimeKey: string, ownerScope: RuntimeScope): FrameRouterRuntime {
    let runtimes = this.runtimes.get(router);

    if (!runtimes) {
      runtimes = new Map();
      this.runtimes.set(router, runtimes);
    }

    const preparedRuntime = runtimes.get(runtimeKey);

    if (preparedRuntime && preparedRuntime.getSnapshot().phase !== 'disposed') {
      return preparedRuntime;
    }

    const runtime = new FrameRouterRuntime(router, ownerScope, runtimeKey);

    runtimes.set(runtimeKey, runtime);

    return runtime;
  }
}
