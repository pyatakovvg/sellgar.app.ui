import { createApplication } from 'sellgar-next-application';

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

export function startBrowserApplication(): Promise<Application> {
  return getEntry().ready;
}

export function acquireBrowserApplication(): BrowserApplicationLease {
  const entry = getEntry();
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

function getEntry(): BrowserApplicationEntry {
  if (current) return current;

  const ready = Promise.resolve()
    .then(() => startApplication(createApplication))
    .then((app) => {
      if (process.env.NODE_ENV === 'development') {
        console.info('[sellgar/app/next] client application ready');
      }
      return app;
    });

  current = { ready, leases: 0 };
  return current;
}
