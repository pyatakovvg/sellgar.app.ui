import { observer } from 'mobx-react';
import type React from 'react';

export interface ReactiveProps {
  readonly children: () => React.ReactNode;
}

const ReactiveView: React.FunctionComponent<ReactiveProps> = ({ children }) => {
  return <>{children()}</>;
};

export const Reactive = observer(ReactiveView);
