import { observer } from 'mobx-react';
import type React from 'react';

export const reactive = <TProps extends object>(
  Component: React.FunctionComponent<TProps>,
): React.FunctionComponent<TProps> => {
  return observer(Component);
};
