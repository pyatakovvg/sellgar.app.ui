import React from 'react';

export type RenderableView<TProps extends object = Record<string, never>> =
  React.ComponentType<TProps> | React.ReactElement | ((props: TProps) => React.ReactNode);

export const renderView = <TProps extends object>(view: RenderableView<TProps>, props: TProps): React.ReactNode => {
  if (React.isValidElement(view)) {
    return view;
  }

  const View = view;

  return <View {...props} />;
};
