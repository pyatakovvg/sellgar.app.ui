import React from 'react';

export type NativeViewComponent<TProps extends object = Record<string, never>> = React.ComponentType<TProps>;

export type NativeViewElement<TProps extends object = Record<string, never>> = React.ReactElement<
  TProps,
  React.ComponentType<TProps>
>;

export type RenderableView<TProps extends object = Record<string, never>> =
  | NativeViewComponent<TProps>
  | NativeViewElement<TProps>;

export const renderView = <TProps extends object>(view: RenderableView<TProps>, props: TProps): React.ReactNode => {
  if (React.isValidElement(view)) {
    return view;
  }

  const View = view as NativeViewComponent<TProps>;

  return <View {...props} />;
};
