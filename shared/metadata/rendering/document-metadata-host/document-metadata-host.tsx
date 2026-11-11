import React from 'react';

import type { MetadataValues } from '../../../../core/metadata/declaration/metadata';
import {
  composeMetadata,
  type MetadataCompositionOptions,
} from '../../../../core/metadata/composition/metadata-composition';
import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';
import { useRouterMetadata } from '../../hook/use-router-metadata';

interface Props<TPresentation> {
  readonly runtime: RouterRuntime<TPresentation>;
  readonly scope: RuntimeScope;
  readonly options?: MetadataCompositionOptions;
  readonly enabled?: boolean;
}

/** Browser side effect only: scope state and navigation ownership stay in core. */
export function DocumentMetadataHost<TPresentation>(props: Props<TPresentation>) {
  const application = props.scope.has(MetadataServiceInterface) ? props.scope.get(MetadataServiceInterface) : undefined;
  const composition = useRouterMetadata(props.runtime, application);
  const values = composeMetadata(
    props.enabled === false ? { application: composition.application, page: {}, frames: [] } : composition,
    props.options,
  );
  return <DocumentMetadata values={values} />;
}

export function DocumentMetadata({
  values,
  restoreOnUnmount = true,
}: {
  readonly values: MetadataValues;
  readonly restoreOnUnmount?: boolean;
}) {
  const original = React.useRef<{
    title: string;
    description: Element | null;
    content: string | null;
    created: HTMLMetaElement | null;
  } | null>(null);
  React.useEffect(() => {
    if (original.current === null) {
      const description = document.head.querySelector('meta[name="description"]');
      original.current = {
        title: document.title,
        description,
        content: description?.getAttribute('content') ?? null,
        created: null,
      };
    }
    return () => {
      const previous = original.current;
      if (!previous) return;
      previous.created?.remove();
      if (restoreOnUnmount) {
        document.title = previous.title;
        if (previous.description) {
          if (!previous.description.isConnected) document.head.append(previous.description);
          if (previous.content === null) previous.description.removeAttribute('content');
          else previous.description.setAttribute('content', previous.content);
        }
      }
      // Keep the baseline across StrictMode replay when Next owns navigation cleanup.
      if (restoreOnUnmount) original.current = null;
    };
  }, [restoreOnUnmount]);
  React.useEffect(() => {
    const previous = original.current;
    if (!previous) return;
    document.title = values.title ?? previous.title;
    if (values.description === undefined) {
      previous.created?.remove();
      if (previous.description) {
        if (!previous.description.isConnected) document.head.append(previous.description);
        if (previous.content === null) previous.description.removeAttribute('content');
        else previous.description.setAttribute('content', previous.content);
      }
      return;
    }
    let element = previous.description ?? previous.created;
    if (!element) {
      const created = document.createElement('meta');
      created.name = 'description';
      previous.created = created;
      element = created;
    }
    if (!element.isConnected) document.head.append(element);
    element.setAttribute('content', values.description);
  }, [values.title, values.description, restoreOnUnmount]);
  return null;
}
