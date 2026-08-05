import { useWidgetRuntime } from '../widget-runtime-context';

export const useWidgetProps = <TProps extends object>(): TProps => {
  return useWidgetRuntime<TProps>().getProps();
};
