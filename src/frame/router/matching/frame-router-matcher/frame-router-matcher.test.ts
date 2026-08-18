import { describe, expect, it } from 'vitest';

import { FrameRoute } from '../../declaration/frame-route';
import { FrameRouter } from '../../declaration/frame-router';

import { matchFrameRouter } from './frame-router-matcher.ts';

describe('matchFrameRouter', () => {
  const reviewRoute = new FrameRoute({ load: async () => ({}) });
  const editRoute = new FrameRoute({ path: 'edit', load: async () => ({}) });
  const historyRoute = new FrameRoute({
    path: 'history',
    routes: [new FrameRoute({ load: async () => ({}) }), new FrameRoute({ path: ':entryId', load: async () => ({}) })],
  });
  const router = new FrameRouter({
    baseSource: 'terminal/:terminalId',
    routes: [reviewRoute, editRoute, historyRoute],
  });

  it('matches an index frame and extracts base params', () => {
    const match = matchFrameRouter(router, '#terminal/42');

    expect(match?.route?.route).toBe(reviewRoute);
    expect(match?.params).toEqual({ terminalId: '42' });
    expect(match?.basePath).toBe('terminal/42');
  });

  it('matches a child frame', () => {
    const match = matchFrameRouter(router, '#terminal/42/edit');

    expect(match?.route?.route).toBe(editRoute);
    expect(match?.route?.path).toBe('edit');
    expect(match?.params).toEqual({ terminalId: '42' });
  });

  it('matches a nested dynamic frame route', () => {
    const match = matchFrameRouter(router, '#terminal/42/history/event%201');

    expect(match?.route?.path).toBe('history/:entryId');
    expect(match?.params).toEqual({ entryId: 'event 1', terminalId: '42' });
    expect(match?.route?.branch).toHaveLength(2);
  });

  it('returns a router match without a leaf for an unknown child path', () => {
    const match = matchFrameRouter(router, '#terminal/42/unknown');

    expect(match).not.toBeNull();
    expect(match?.route).toBeNull();
  });

  it('retains the matched group for an unknown nested path', () => {
    const match = matchFrameRouter(router, '#terminal/42/history/unknown/path');

    expect(match?.route).toBeNull();
    expect(match?.branch).toEqual([historyRoute]);
  });

  it('does not match another base source', () => {
    expect(matchFrameRouter(router, '#employee/42')).toBeNull();
  });

  it('resolves a nested default frame source', () => {
    const settingsRoute = new FrameRoute({
      defaultTo: 'general',
      path: 'settings/:sectionId',
      routes: [new FrameRoute({ load: async () => ({}), path: 'general' })],
    });
    const defaultRouter = new FrameRouter({
      baseSource: 'terminal/:terminalId',
      routes: [settingsRoute],
    });

    const match = matchFrameRouter(defaultRouter, '#terminal/42/settings/main');

    expect(match?.defaultSource).toBe('terminal/42/settings/main/general');
    expect(match?.branch).toEqual([settingsRoute]);
    expect(match?.params).toEqual({ sectionId: 'main', terminalId: '42' });
  });

  it('does not throw on a malformed encoded parameter', () => {
    expect(matchFrameRouter(router, '#terminal/%E0%A4%A')).toBeNull();
  });
});
