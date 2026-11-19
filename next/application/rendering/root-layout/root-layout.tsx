import { composeMetadata } from '../../../../core/metadata/composition/metadata-composition';
import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import 'server-only';

import React from 'react';

import { getApplication } from '../../runtime/server-application';
import { getApplicationRuntime } from '../../lifecycle/application';
import { ApplicationHost as ClientApplicationHost } from '../application-host';

export async function ApplicationHost({ children }: { readonly children: React.ReactNode }) {
  const app = await getApplication();
  return (
    <ClientApplicationHost snapshot={getApplicationRuntime(app).captureSnapshot()}>{children}</ClientApplicationHost>
  );
}

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
      <RootLayout {...props}>
        <ApplicationHost>{props.children}</ApplicationHost>
      </RootLayout>
    );
  };
}

export async function generateApplicationMetadata() {
  const app = await getApplication();
  return composeMetadata(
    { application: app.getDependency(MetadataServiceInterface).getSnapshot(), page: {}, frames: [] },
    app.metadataOptions,
  );
}
