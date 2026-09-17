import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { useRuntimeSubmit } from '../../../../shared/controller/hook/use-submit';
import { useControllerRuntime } from '../../runtime/controller-runtime-context';

export type { ControllerSubmit } from '../../../../shared/controller/hook/use-submit';

export const useSubmit = <TController>(controllerToken: DependencyToken<TController>) =>
  useRuntimeSubmit(useControllerRuntime(), controllerToken);
