import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationMetricInterface } from '../../../../../core/application/metric/service/application-metric';
import { MetricEvent } from '../../../../../core/application/metric/declaration/metric-event';
import { Metric } from '../../../../../core/application/metric/declaration/metric';
import { ApplicationScope } from '../../../../../core/runtime/scope/kind/application-scope';
import { RuntimeScopeProvider } from '../../../../runtime/scope/runtime-scope-context';
import { useMetric } from './use-metric.hook';

describe('useMetric (fsm)', () => {
  it('uses the application DI service and does not track on render or rerender', async () => {
    const track = vi.fn();
    @Metric()
    class Adapter {
      track = track;
    }
    @MetricEvent('view.action')
    class ActionEvent {
      source!: string;
    }
    const scope = new ApplicationScope();
    scope.activateMetrics([Adapter]);
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <React.StrictMode>
        <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>
      </React.StrictMode>
    );
    const { result, rerender, unmount } = renderHook(useMetric, { wrapper });
    expect(result.current).toBe(scope.get(ApplicationMetricInterface));
    rerender();
    expect(track).not.toHaveBeenCalled();
    result.current.track(ActionEvent, { source: 'button' });
    await vi.waitFor(() => expect(track).toHaveBeenCalledExactlyOnceWith('view.action', { source: 'button' }));
    unmount();
    await scope.disposeMetrics();
    scope.dispose();
  });
});
