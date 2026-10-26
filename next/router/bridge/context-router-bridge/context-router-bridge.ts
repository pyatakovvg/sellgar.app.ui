import type { RouterBridgeInterface } from '../../../../core/router/bridge/router-bridge';

/** Satisfies the existing bootstrap contract without subscribing to Next navigation. */
export class ContextRouterBridge implements RouterBridgeInterface {
  readonly runtimeRetention = 'release' as const;

  initialize(): void {}

  commit(): never {
    throw new Error('В приложении Next используйте навигацию Next.js.');
  }

  back(): never {
    throw new Error('В приложении Next используйте навигацию Next.js.');
  }

  dispose(): void {}
}
