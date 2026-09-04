import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useException } from '../exception-context';
import { RuntimeErrorBoundary } from './runtime-error-boundary.tsx';

describe('RuntimeErrorBoundary', () => {
  it('renders the owner exception and reports the render failure', async () => {
    const error = new Error('render failed');
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const ExceptionView = (): React.ReactNode => {
      const captured = useException();

      return <div>{captured === error ? 'captured render failure' : 'unexpected failure'}</div>;
    };
    const BrokenView = (): React.ReactNode => {
      throw error;
    };

    render(
      <RuntimeErrorBoundary exception={<ExceptionView />} onError={onError} resetKeys={[]}>
        <BrokenView />
      </RuntimeErrorBoundary>,
    );

    expect(screen.getByText('captured render failure')).toBeInTheDocument();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(error, expect.anything()));
    consoleError.mockRestore();
  });
});
