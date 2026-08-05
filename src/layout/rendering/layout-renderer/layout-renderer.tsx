import React from 'react';

import { renderView } from '../../../react/view/renderable-view';
import { getLayoutMetadata, type LayoutConstructor } from '../../declaration/layout';

export const renderLayouts = (layouts: readonly LayoutConstructor[], children: React.ReactNode): React.ReactNode => {
  return layouts.reduceRight((content, layout) => {
    const metadata = getLayoutMetadata(layout);

    return renderView(metadata.view, {
      children: content,
    });
  }, children);
};
