import { composeMetadata } from '../../../../core/metadata/composition/metadata-composition';
import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
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
