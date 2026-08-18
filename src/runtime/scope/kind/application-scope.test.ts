import { describe, expect, it, vi } from 'vitest';

import { RequestExecutorInterface } from '../../../application/request';
import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { UnauthorizedException } from '../../../http';

import { ApplicationScope } from './application-scope.ts';
import { FrameScope } from './frame-scope.ts';
import { ModuleScope } from './module-scope.ts';

describe('ApplicationScope', () => {
  it('shares request coordination across child runtime scopes', async () => {
    const session = new SessionRuntimeState();
    const applicationScope = new ApplicationScope();
    const moduleScope = new ModuleScope(applicationScope);
    const frameScope = new FrameScope(applicationScope);

    applicationScope.bindSession(session);
    session.setAuthenticated();

    const moduleExecutor = moduleScope.get(RequestExecutorInterface);
    const frameExecutor = frameScope.get(RequestExecutorInterface);
    const moduleRequestSignals: AbortSignal[] = [];
    const moduleRequestSettled = vi.fn();

    expect(moduleExecutor).toBe(frameExecutor);

    const moduleRequest = moduleExecutor.run(({ signal }) => {
      moduleRequestSignals.push(signal);

      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    void moduleRequest.then(moduleRequestSettled, moduleRequestSettled);
    void frameExecutor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));

    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));

    const activeModuleRequestSignal = moduleRequestSignals[0];

    if (activeModuleRequestSignal === undefined) {
      throw new Error('Module request signal was not captured.');
    }

    expect(activeModuleRequestSignal.aborted).toBe(true);
    expect(moduleRequestSettled).not.toHaveBeenCalled();

    frameScope.dispose();
    moduleScope.dispose();
    applicationScope.dispose();
  });
});
