import React from 'react';

import { ExceptionProvider } from '../exception-context';

interface IProps {
  readonly children: React.ReactNode;
  readonly exception: React.ReactNode;
  readonly onError: (error: unknown) => void;
  readonly resetKeys: readonly unknown[];
}

interface IState {
  readonly error: unknown | null;
  readonly resetKeys: readonly unknown[];
}

export class RuntimeErrorBoundary extends React.Component<IProps, IState> {
  state: IState = { error: null, resetKeys: this.props.resetKeys };

  static getDerivedStateFromError(error: unknown): Partial<IState> {
    return { error };
  }

  static getDerivedStateFromProps(props: IProps, state: IState): Partial<IState> | null {
    return areResetKeysEqual(props.resetKeys, state.resetKeys) ? null : { error: null, resetKeys: props.resetKeys };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  render(): React.ReactNode {
    if (this.state.error !== null) {
      return <ExceptionProvider error={this.state.error}>{this.props.exception}</ExceptionProvider>;
    }

    return this.props.children;
  }
}

const areResetKeysEqual = (left: readonly unknown[], right: readonly unknown[]): boolean => {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
};
