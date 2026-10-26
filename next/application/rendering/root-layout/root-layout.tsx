import 'server-only';

import React from 'react';

import { getApplication } from '../../runtime/server-application';
import { ApplicationHost } from '../application-host';

export function withRootLayout<TProps extends { readonly children: React.ReactNode }>(
  RootLayout: React.ComponentType<TProps>,
  hasBodyBoundary = false,
) {
  return async function SellgarRootLayout(props: TProps) {
    await getApplication();
    // A compiled <body> boundary covers layouts composed by RootLayout itself.
    // Keep the children fallback for roots that delegate the document markup.
    return hasBodyBoundary ? (
      <RootLayout {...props} />
    ) : (
      <RootLayout {...props} children={<ApplicationHost>{props.children}</ApplicationHost>} />
    );
  };
}
