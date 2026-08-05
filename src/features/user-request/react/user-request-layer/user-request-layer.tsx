import React from 'react';

import { useDependency } from '../../../../runtime/react';
import { UserRequestPresentation } from '../../declaration/user-request-presentation';
import { UserRequestRuntimeInterface } from '../../runtime/user-request-runtime';

interface UserRequestLayerProps {
  readonly presentation: UserRequestPresentation;
}

export const UserRequestLayer: React.FC<UserRequestLayerProps> = ({ presentation }) => {
  const runtime = useDependency(UserRequestRuntimeInterface);
  const request = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    () => null,
  );

  if (request === null) {
    return null;
  }

  const View = presentation.resolve(request.kind);

  return (
    <View
      request={request}
      apply={(value) => runtime.apply(request.id, value)}
      cancel={() => runtime.cancel(request.id)}
    />
  );
};
