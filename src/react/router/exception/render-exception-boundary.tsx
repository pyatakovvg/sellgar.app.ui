import React from 'react';

import { ExceptionProvider } from './exception.context';

interface RenderExceptionBoundaryProps {
  readonly children: React.ReactNode;
  readonly exception: React.ReactNode;
  readonly onError: (error: unknown) => void;
}

interface RenderExceptionBoundaryState {
  readonly error: unknown;
  readonly failed: boolean;
}

export class RenderExceptionBoundary extends React.Component<
  RenderExceptionBoundaryProps,
  RenderExceptionBoundaryState
> {
  state: RenderExceptionBoundaryState = {
    error: null,
    failed: false,
  };

  static getDerivedStateFromError(error: unknown): RenderExceptionBoundaryState {
    return {
      error,
      failed: true,
    };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  render(): React.ReactNode {
    if (this.state.failed) {
      return <ExceptionProvider error={this.state.error}>{this.props.exception ?? null}</ExceptionProvider>;
    }

    return this.props.children;
  }
}
