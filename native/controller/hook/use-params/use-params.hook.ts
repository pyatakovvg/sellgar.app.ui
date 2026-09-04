import { useControllerRuntime } from '../../runtime/controller-runtime-context';

export const useParams = <
  TParams extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
>(): TParams => {
  return useControllerRuntime().getParams() as TParams;
};
