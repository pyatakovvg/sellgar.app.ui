import type React from 'react';

import { Injectable } from '../../../../core/di/injection/decorators';

export interface ShellContextInterface {
  readonly close: () => void | Promise<void>;
  readonly content: React.ReactNode;
  readonly open: boolean;
}

export abstract class ShellInterface {
  abstract render(context: ShellContextInterface): React.ReactNode;
}

export const Shell = (): ClassDecorator => {
  return Injectable();
};
