import type React from 'react';

import type { RenderableView } from '../../../view/renderable-view';

const SHELL_METADATA_KEY = Symbol('@sellgar/app:native:shell:metadata');

export interface ShellContextInterface {
  readonly children: React.ReactNode;
}

export interface ShellController {
  close(): void;
}

export interface ShellMetadata {
  readonly backdrop?: RenderableView;
  readonly view: RenderableView<ShellContextInterface>;
}

export abstract class ShellInterface {}

export type ShellConstructor = abstract new (...args: never[]) => ShellInterface;

export const isShellConstructor = (value: unknown): value is ShellConstructor => {
  return typeof value === 'function' && Reflect.hasMetadata(SHELL_METADATA_KEY, value);
};

export const getShellMetadata = (shell: ShellConstructor): ShellMetadata => {
  const metadata = Reflect.getMetadata(SHELL_METADATA_KEY, shell) as ShellMetadata | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные Native Shell не определены.');
  }

  return metadata;
};

export const Shell = (metadata: ShellMetadata): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(SHELL_METADATA_KEY, Object.freeze({ ...metadata }), constructor);
  };
};
