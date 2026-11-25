import type { RuntimeController } from '../../../controller/contract/controller';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { createCollectorComposition } from '../../../collection/runtime/collector-composition';
import type { RuntimeScope } from '../../scope/base/runtime-scope';

import { ControllerResourceGroup } from './controller-resources';

export interface ControllerResourceRuntime {
  resolve(token: DependencyToken<unknown>): RuntimeController;
  beginRelease(): void;
  dispose(): Promise<void>;
}

// Composition joins collection dependencies to the generic controller lifetime.
export const createControllerResourceRuntime = (scope: RuntimeScope): ControllerResourceRuntime => {
  const group = new ControllerResourceGroup();
  const collections = createCollectorComposition(scope.getControllerConstructors(), () => group.capture());
  const uninstall = scope.installDependencyModule(collections.module);
  const errors: unknown[] = [];
  let released = false;
  let disposePromise: Promise<void> | undefined;

  const beginRelease = (): void => {
    if (released) return;
    released = true;
    try {
      collections.revoke();
    } catch (error) {
      errors.push(error);
    }
    group.beginRelease();
    try {
      uninstall();
    } catch (error) {
      errors.push(error);
    }
  };

  return {
    resolve: (token) =>
      group.resolve(token, scope.getControllerConstructor(token), () => scope.get(token) as RuntimeController),
    beginRelease,
    dispose: () => {
      if (disposePromise) return disposePromise;
      beginRelease();
      disposePromise = (async () => {
        try {
          await group.dispose();
        } catch (error) {
          errors.push(error);
        }
        try {
          collections.dispose();
        } catch (error) {
          errors.push(error);
        }
        try {
          uninstall();
        } catch (error) {
          errors.push(error);
        }
        if (errors.length) throw new AggregateError(errors, 'Ошибки освобождения зависимостей контроллеров.');
      })();
      return disposePromise;
    },
  };
};
