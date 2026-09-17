import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { useRuntimeRevalidate } from '../../../../shared/revalidate/hook/use-revalidate';
import { useControllerRuntime } from '../../../controller/runtime/controller-runtime-context';

export type { RevalidateHandler } from '../../../../shared/revalidate/hook/use-revalidate';

export const useRevalidate = (controllerToken?: DependencyToken<unknown>) =>
  useRuntimeRevalidate(useControllerRuntime(), controllerToken);
