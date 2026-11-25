import { describe, expect, it, vi } from 'vitest';

import { ControllerResourceGroup } from './controller-resources';

class TestController {}

describe('ControllerResourceGroup', () => {
  it('revokes synchronously and runs final disposal separately without changing user cleanup ordering', async () => {
    const group = new ControllerResourceGroup();
    const events: string[] = [];
    let released = false;
    group.resolve(TestController, TestController, () => {
      const { owner } = group.capture();
      owner.own({
        revoke: () => {
          released = owner.closed;
          events.push('revoke');
        },
        dispose: () => {
          events.push('resource.dispose');
        },
      });
      return new TestController();
    });

    group.beginRelease();
    expect(released).toBe(true);
    expect(events).toEqual(['revoke']);
    events.push('controller.dispose');
    await group.dispose();
    expect(events).toEqual(['revoke', 'controller.dispose', 'resource.dispose']);
    await group.dispose();
    expect(events).toHaveLength(3);
  });

  it('rolls back resources acquired before a constructor throws even without a controller instance', async () => {
    const group = new ControllerResourceGroup();
    const revoke = vi.fn();
    const dispose = vi.fn();
    const error = new Error('constructor failed');
    expect(() =>
      group.resolve(TestController, TestController, () => {
        group.capture().owner.own({ revoke, dispose });
        throw error;
      }),
    ).toThrow(error);
    expect(revoke).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    expect(() => group.capture()).toThrow('разрешении');
    await group.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('contains revocation failures, still revokes every resource, and runs every finalizer', async () => {
    const group = new ControllerResourceGroup();
    const revoke = vi.fn();
    const dispose = vi.fn();
    group.resolve(TestController, TestController, () => {
      const { owner } = group.capture();
      owner.own({
        revoke: () => {
          throw new Error('revoke failed');
        },
        dispose: () => {
          throw new Error('dispose failed');
        },
      });
      owner.own({ revoke, dispose });
      return new TestController();
    });
    expect(() => group.beginRelease()).not.toThrow();
    expect(revoke).toHaveBeenCalledOnce();
    await expect(group.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects reuse of a cached controller whose owned resources belong to an earlier lifetime', async () => {
    const first = new ControllerResourceGroup();
    const controller = first.resolve(TestController, TestController, () => {
      first.capture().owner.own({ revoke: vi.fn() });
      return new TestController();
    });
    await first.dispose();
    const next = new ControllerResourceGroup();
    expect(() => next.resolve(TestController, TestController, () => controller)).toThrow('другому runtime');
    await next.dispose();
  });

  it('preserves existing cached controllers without owned resources', async () => {
    const controller = new TestController();
    const first = new ControllerResourceGroup();
    expect(first.resolve(TestController, TestController, () => controller)).toBe(controller);
    await first.dispose();
    const next = new ControllerResourceGroup();
    expect(next.resolve(TestController, TestController, () => controller)).toBe(controller);
    await next.dispose();
  });

  it('rejects nested root resolutions and resets the synchronous frame after failure', async () => {
    const group = new ControllerResourceGroup();
    expect(() =>
      group.resolve(TestController, TestController, () =>
        group.resolve(TestController, TestController, () => new TestController()),
      ),
    ).toThrow('Вложенное');
    const controller = group.resolve(TestController, TestController, () => new TestController());
    expect(controller).toBeInstanceOf(TestController);
    await group.dispose();
  });
});
