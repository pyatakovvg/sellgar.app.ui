import React from 'react';

import { getLayoutMetadata, type LayoutConstructor } from '../../declaration/layout';
import { renderView } from '../../../view/renderable-view';

export const renderLayouts = (layouts: readonly LayoutConstructor[], children: React.ReactNode): React.ReactNode => {
  return layouts.reduceRight((content, layout) => {
    return renderView(getLayoutMetadata(layout).view, { children: content });
  }, children);
};
