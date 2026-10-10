import React from 'react';

import { getLayoutMetadata, type LayoutConstructor, type LayoutViewProps } from '../../declaration/layout';
import type { LayoutContentKind } from '../../../../shared/layout/declaration/layout-content-kind';
import { renderView } from '../../../view/renderable-view';

export const renderLayouts = (
  layouts: readonly LayoutConstructor[],
  children: React.ReactNode,
  kind: LayoutContentKind,
): React.ReactNode => {
  return layouts.reduceRight<LayoutViewProps>(
    (content, layout) => {
      const view = getLayoutMetadata(layout).view;
      // This is the declared layout view, not an arbitrary children element.
      const children = React.isValidElement<LayoutViewProps>(view)
        ? React.cloneElement(view, content)
        : renderView(view, content);
      return { children, kind: 'layout' };
    },
    { children, kind },
  ).children;
};
