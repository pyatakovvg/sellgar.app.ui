import { describe, expect, it } from 'vitest';

import * as PublicApi from './index.ts';

describe('@tiyn/app public API', () => {
  it('does not expose framework runtime internals', () => {
    expect(PublicApi).not.toHaveProperty('FrameNavigateServiceBindings');
    expect(PublicApi).not.toHaveProperty('FrameRouterRuntime');
    expect(PublicApi).not.toHaveProperty('getFrameHistoryState');
    expect(PublicApi).not.toHaveProperty('getFrameRouteDefinition');
    expect(PublicApi).not.toHaveProperty('getFrameRouterDefinition');
    expect(PublicApi).not.toHaveProperty('matchFrameRouter');
    expect(PublicApi).not.toHaveProperty('resolveFrameExport');
    expect(PublicApi).not.toHaveProperty('FrameRuntimeServiceInterface');
    expect(PublicApi).not.toHaveProperty('RevalidateRegistryInterface');
    expect(PublicApi).not.toHaveProperty('WidgetRuntimeFactoryInterface');
    expect(PublicApi).not.toHaveProperty('createHashFromObject');
    expect(PublicApi).not.toHaveProperty('parseHashToObject');
    expect(PublicApi).not.toHaveProperty('parseSearchParams');
    expect(PublicApi).not.toHaveProperty('updateSearchParams');
  });

  it('exposes frame routing declarations through the common navigation port', () => {
    expect(PublicApi).not.toHaveProperty('FrameDefinition');
    expect(PublicApi).not.toHaveProperty('FrameNavigateServiceInterface');
    expect(PublicApi).toHaveProperty('FrameRoute');
    expect(PublicApi).toHaveProperty('FrameRouter');
    expect(PublicApi).not.toHaveProperty('useFrameNavigate');
    expect(PublicApi).toHaveProperty('useParams');
    expect(PublicApi).toHaveProperty('NavigateServiceInterface');
  });
});
