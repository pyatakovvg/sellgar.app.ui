import { createApplication } from 'sellgar-next-application';

import type { ApplicationSnapshot } from '../../state/application-state';

import { type Application, startApplication } from '../../lifecycle/application';

interface BrowserApplicationEntry {
  readonly ready: Promise<Application>;
  leases: number;
}

export interface BrowserApplicationLease {
  readonly ready: Promise<Application>;
  release(): void;
}

let current: BrowserApplicationEntry | null = null;

export function startBrowserApplication(snapshot?: ApplicationSnapshot): Promise<Application> {
  return getEntry(snapshot).ready;
}

export function acquireBrowserApplication(snapshot?: ApplicationSnapshot): BrowserApplicationLease {
  const entry = getEntry(snapshot);
  entry.leases += 1;
  let released = false;

  return {
    ready: entry.ready,
    release() {
      if (released) return;
      released = true;
      entry.leases -= 1;

      // React StrictMode replays effects synchronously. A new lease keeps the
      // application alive rather than starting a second bootstrap.
      queueMicrotask(() => {
        if (entry.leases !== 0 || current !== entry) return;
        current = null;
        void entry.ready
          .then(
            (app) => app.dispose(),
            () => undefined,
          )
          .catch((error: unknown) => console.error('[sellgar/app/next] Не удалось освободить приложение', error));
      });
    },
  };
}

function getEntry(snapshot?: ApplicationSnapshot): BrowserApplicationEntry {
  if (current) return current;

  const ready = Promise.resolve()
    .then(() => startApplication(createApplication, { snapshot }))
    .then((app) => {
      if (process.env.NODE_ENV === 'development') {
        console.info('[sellgar/app/next] client application ready');
      }
      return app;
    });

  current = { ready, leases: 0 };
  return current;
}
