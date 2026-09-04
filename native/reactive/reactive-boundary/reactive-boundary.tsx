import { observer } from 'mobx-react';
import type React from 'react';

export interface ReactiveProps {
  readonly children: () => React.ReactNode;
}

const ReactiveBoundary: React.FunctionComponent<ReactiveProps> = (props) => {
  return <>{props.children()}</>;
};

export const Reactive = observer(ReactiveBoundary);
