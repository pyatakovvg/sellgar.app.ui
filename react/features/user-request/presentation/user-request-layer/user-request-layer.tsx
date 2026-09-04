import React from 'react';

import { UserRequestRuntimeInterface } from '../../../../../core/features/user-request/runtime/user-request-runtime';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';
import type { UserRequestPresentation } from '../../declaration/user-request-presentation';

interface IProps {
  readonly presentation: UserRequestPresentation;
}

export const UserRequestLayer: React.FC<IProps> = (props) => {
  const runtime = useDependency(UserRequestRuntimeInterface);
  const request = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot<React.ReactNode>(), [runtime]),
    () => null,
  );

  if (request === null) {
    return null;
  }

  if (request.kind === 'alert') {
    const View = props.presentation.resolve('alert');

    return (
      <View
        key={request.id}
        request={request}
        apply={() => runtime.apply(request.id)}
        cancel={() => runtime.cancel(request.id)}
      />
    );
  }

  if (request.kind === 'confirm') {
    const View = props.presentation.resolve('confirm');

    return (
      <View
        key={request.id}
        request={request}
        apply={() => runtime.apply(request.id)}
        cancel={() => runtime.cancel(request.id)}
      />
    );
  }

  const View = props.presentation.resolve('prompt');

  return (
    <View
      key={request.id}
      request={request}
      apply={(value) => runtime.apply(request.id, value)}
      cancel={() => runtime.cancel(request.id)}
    />
  );
};
