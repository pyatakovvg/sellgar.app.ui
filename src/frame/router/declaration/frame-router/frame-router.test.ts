import { describe, expect, it } from 'vitest';

import { FrameRoute } from '../frame-route';

import { FrameRouter, getFrameRouterDefinition, isFrameRouter } from './frame-router.ts';

describe('FrameRouter', () => {
  it('normalizes baseSource and stores routes', () => {
    const route = new FrameRoute({ load: async () => ({}) });
    const router = new FrameRouter({ baseSource: '#terminal/:terminalId/', routes: [route] });

    expect(getFrameRouterDefinition(router)).toMatchObject({
      baseSource: 'terminal/:terminalId',
      routes: [route],
    });
    expect(isFrameRouter(router)).toBe(true);
    expect(isFrameRouter({})).toBe(false);
  });

  it('rejects an empty baseSource', () => {
    expect(() => new FrameRouter({ baseSource: '/', routes: [new FrameRoute({ load: async () => ({}) })] })).toThrow(
      'baseSource frame-роутера не может быть пустым.',
    );
  });

  it('rejects an empty route list', () => {
    expect(() => new FrameRouter({ baseSource: 'terminal', routes: [] })).toThrow(
      'FrameRouter должен содержать маршруты.',
    );
  });
});
