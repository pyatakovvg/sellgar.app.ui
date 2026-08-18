import type React from 'react';

import { Injectable } from '../../../di/injection/decorators';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { RenderableView } from '../../../react/view/renderable-view';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';

export const FRAME_METADATA_KEY = Symbol('tiyn-app:frame:metadata');

export interface FrameShellContextInterface {
  readonly close: () => void | Promise<void>;
  readonly content: React.ReactNode;
  readonly open: boolean;
}

export abstract class FrameShellInterface {
  abstract render(context: FrameShellContextInterface): React.ReactNode;
}

export interface FrameMetadata {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly providers?: readonly ProviderToken[];
  readonly view: RenderableView;
}

export type FrameConstructor = abstract new (...args: never[]) => object;

export const isFrameConstructor = (value: unknown): value is FrameConstructor => {
  if (typeof value !== 'function') {
    return false;
  }

  return Reflect.hasMetadata(FRAME_METADATA_KEY, value);
};

export const getFrameMetadata = (frame: FrameConstructor): FrameMetadata => {
  const metadata = Reflect.getMetadata(FRAME_METADATA_KEY, frame) as FrameMetadata | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные фрейма не определены.');
  }

  return metadata;
};

export const Frame = (metadata: FrameMetadata): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(FRAME_METADATA_KEY, metadata, constructor);
  };
};

export const FrameShell = (): ClassDecorator => {
  return Injectable();
};
