import React from 'react';
import { describe, expect, it } from 'vitest';

import { FrameShell, FrameShellInterface, type FrameShellContextInterface } from '../../../frame/declaration/frame';

import { ApplicationConfig } from './application-config.ts';

describe('ApplicationConfig frames', () => {
  it('inherits omitted frame boundaries from application components regardless of configuration order', () => {
    const config = new ApplicationConfig();
    const exception = <div>Application exception</div>;
    const fallback = <div>Application fallback</div>;
    const forbidden = <div>Application forbidden</div>;
    const notFound = <div>Application not found</div>;

    config.frames({ shell: TestFrameShell });
    config.components({ exception, fallback, forbidden, notFound });

    expect(config.framesValue).toEqual({
      exception,
      fallback,
      forbidden,
      notFound,
      shell: TestFrameShell,
    });
  });

  it('lets frame configuration override inherited application boundaries', () => {
    const config = new ApplicationConfig();
    const frameException = <div>Frame exception</div>;

    config.components({ exception: <div>Application exception</div> });
    config.frames({ exception: frameException, shell: TestFrameShell });

    expect(config.framesValue?.exception).toBe(frameException);
  });
});

@FrameShell()
class TestFrameShell implements FrameShellInterface {
  render(context: FrameShellContextInterface): React.ReactNode {
    return context.content;
  }
}
