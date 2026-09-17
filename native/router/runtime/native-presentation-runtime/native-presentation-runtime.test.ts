import { describe, expect, it, vi } from 'vitest';
import { NativePresentationRuntime, type NativePresentationSource } from './native-presentation-runtime.ts';

vi.mock('../native-route-projection', () => ({
  NativeRouteProjectionRuntime: class {
    project() {
      return false;
    }
  },
}));
vi.mock('../../declaration/router', () => ({ getRouterPresentationDefinition: () => ({}) }));
vi.mock('../../rendering/presentation-cycle', () => ({
  resolveNativeFrameTransition: (_source: unknown, _target: unknown, revision: number) => ({
    depth: 0,
    operation: 'present',
    revision,
  }),
}));

const createSource = () => {
  let revision = 1;
  let notify = () => {};
  const navigation = { root: { child: {} } };
  const application = { navigation, pending: null, decision: null };
  const completePresentation = vi.fn();
  const router = {};
  // The projection and bridge are controlled ports; no animation/native UI is executed here.
  const source = {
    components: {},
    getHistoryEntries: () => [],
    getNavigation: () => application,
    getRouterRuntime: () => ({ router }),
    getRuntimeEntries: () => [],
    subscribeNavigation: () => () => {},
    routerBridge: {
      subscribe: (listener: () => void) => {
        notify = listener;
        return () => {};
      },
      getSnapshot: () => ({ backInProgress: false, action: 'push' }),
      getPendingPresentationRevision: () => revision,
      getPresentedNavigation: () => navigation,
      completePresentation,
    },
  } as unknown as NativePresentationSource;
  return {
    source,
    completePresentation,
    advance: (next: number) => {
      revision = next;
      notify();
    },
  };
};

describe('frame participation in presentation cycles', () => {
  it('rejects completion from a superseded revision', () => {
    const fixture = createSource();
    const runtime = new NativePresentationRuntime(fixture.source);
    fixture.advance(2);
    runtime.completeFrame(1);
    expect(fixture.completePresentation).not.toHaveBeenCalled();
    runtime.completeFrame(2);
    expect(fixture.completePresentation).toHaveBeenCalledExactlyOnceWith(2);
    runtime.completeFrame(2);
    expect(fixture.completePresentation).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it('preserves a new cycle started synchronously by completion of the previous one', () => {
    const fixture = createSource();
    const runtime = new NativePresentationRuntime(fixture.source);
    fixture.completePresentation.mockImplementationOnce(() => fixture.advance(2));
    runtime.completeFrame(1);
    runtime.completeFrame(2);
    expect(fixture.completePresentation.mock.calls).toEqual([[1], [2]]);
    runtime.dispose();
  });
});
