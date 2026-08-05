import type React from 'react';

import { Injectable } from '../../../di/injection/decorators';
import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { RoutePolicyDeclaration } from '../../../router/runtime/route-runtime-context';
import type { RenderableView } from '../../../react/view/renderable-view';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';
import type { FrameSourceInterface } from '../../source/frame-source';

export const FRAME_METADATA_KEY = Symbol('tiyn-app:frame:metadata');

export interface FrameShellContextInterface {
  readonly back: () => void | Promise<void>;
  readonly close: () => void | Promise<void>;
  readonly content: React.ReactNode;
  readonly open: boolean;
}

export abstract class FrameShellInterface {
  abstract render(context: FrameShellContextInterface): React.ReactNode;
}

export interface FrameMetadata<TProps extends object = object> {
  readonly canActivate?: readonly RoutePolicyDeclaration[];
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly providers?: readonly ProviderToken<TProps>[];
  readonly shell?: DependencyConstructor<FrameShellInterface>;
  readonly source?: FrameSourceInterface<TProps>;
  readonly view: RenderableView<TProps>;
}

export abstract class FrameDefinition<TProps extends object = object> {
  declare readonly __frameProps?: TProps;
}

export type FrameConstructor<TProps extends object = object> = abstract new (
  ...args: never[]
) => FrameDefinition<TProps>;

export type FrameProps<TFrame extends FrameConstructor> =
  TFrame extends FrameConstructor<infer TProps> ? TProps : never;

export const isFrameConstructor = (value: unknown): value is FrameConstructor => {
  if (typeof value !== 'function') {
    return false;
  }

  return Reflect.hasMetadata(FRAME_METADATA_KEY, value);
};

export const getFrameMetadata = <TProps extends object = object>(
  frame: FrameConstructor<TProps>,
): FrameMetadata<TProps> => {
  const metadata = Reflect.getMetadata(FRAME_METADATA_KEY, frame) as FrameMetadata<TProps> | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные фрейма не определены.');
  }

  return metadata;
};

export const Frame = <TProps extends object = object>(metadata: FrameMetadata<TProps>): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(FRAME_METADATA_KEY, metadata, constructor);
  };
};

export const FrameShell = (): ClassDecorator => {
  return Injectable();
};
