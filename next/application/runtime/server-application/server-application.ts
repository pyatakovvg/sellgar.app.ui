import 'server-only';

import { cache } from 'react';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { createApplication } from 'sellgar-next-application';

import { startApplication } from '../../lifecycle/application';

/** Shared within one RSC render. No application instance is stored globally on the server. */
export const getApplication = cache(async () => {
  const requestHeaders = Object.fromEntries((await headers()).entries());
  const app = await startApplication(createApplication, { request: { headers: requestHeaders } });
  after(() => app.dispose());

  if (process.env.NODE_ENV === 'development') {
    console.info('[sellgar/app/next] server application ready');
  }

  return app;
});
