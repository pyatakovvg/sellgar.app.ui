import React from 'react';

import { UserRequestRuntimeInterface } from '../../../../../core/features/user-request/runtime/user-request-runtime';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';
import type { UserRequestPresentation } from '../../declaration/user-request-presentation';
import { ModalHost } from '../../../../application/rendering/modal-host';
import type { ScreenPresentation } from '../../../../screen/declaration/screen-presentation';

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

  let content: React.ReactNode;

  if (request.kind === 'alert') {
    const View = props.presentation.resolve('alert');

    content = (
      <View
        request={request}
        apply={() => runtime.apply(request.id)}
        cancel={() => runtime.cancel(request.id)}
      />
    );
  } else if (request.kind === 'confirm') {
    const View = props.presentation.resolve('confirm');

    content = (
      <View
        request={request}
        apply={() => runtime.apply(request.id)}
        cancel={() => runtime.cancel(request.id)}
      />
    );
  } else {
    const View = props.presentation.resolve('prompt');

    content = (
      <View
        request={request}
        apply={(value) => runtime.apply(request.id, value)}
        cancel={() => runtime.cancel(request.id)}
      />
    );
  }

  const presentation: ScreenPresentation = Object.freeze({
    content,
    key: `user-request-${request.id}`,
  });

  return <ModalHost onRequestClose={() => runtime.cancel(request.id)} presentation={presentation} />;
};
