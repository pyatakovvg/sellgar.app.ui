'use client';

import React from 'react';
import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import type { MetadataValues } from '../../../../core/metadata/declaration/metadata';
import { composeMetadata } from '../../../../core/metadata/composition/metadata-composition';
import { DocumentMetadata } from '../../../../shared/metadata/rendering/document-metadata-host';
import { useApplication } from '../../../application/hook/use-application';
import type { ClientModule } from '../../runtime/client-module';

export function ModuleMetadataHost(props: {
  readonly module: ClientModule;
  readonly applicationMetadata?: MetadataValues;
  readonly resolvedMetadata?: MetadataValues;
}) {
  const app = useApplication();
  const application = app?.getDependency(MetadataServiceInterface);
  const page = React.useSyncExternalStore(
    props.module.subscribe,
    props.module.getMetadataSnapshot,
    props.module.getMetadataSnapshot,
  );
  const base = React.useSyncExternalStore(
    application?.subscribe.bind(application) ?? EMPTY_SUBSCRIBE,
    () => application?.getSnapshot() ?? props.applicationMetadata ?? EMPTY,
    () => props.applicationMetadata ?? EMPTY,
  );
  const values = app
    ? composeMetadata({ application: base, page, frames: [] }, app.metadataOptions)
    : (props.resolvedMetadata ?? composeMetadata({ application: base, page, frames: [] }));
  return <DocumentMetadata values={values} restoreOnUnmount={false} />;
}

const EMPTY: MetadataValues = Object.freeze({});
const EMPTY_SUBSCRIBE = () => () => {};
