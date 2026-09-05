import React from 'react';

export type ViewportFlexWeight = boolean | number;

export interface ViewportSlotProps extends React.PropsWithChildren {
  readonly grow?: ViewportFlexWeight;
  readonly shrink?: ViewportFlexWeight;
}

export type ViewportFloatingVertical = 'bottom' | 'center' | 'top';
export type ViewportFloatingHorizontal = 'center' | 'end' | 'start';

export interface ViewportFloatingSlotProps extends React.PropsWithChildren {
  readonly horizontal?: ViewportFloatingHorizontal;
  readonly vertical?: ViewportFloatingVertical;
}

export interface ViewportRefreshableProps {}

export interface ViewportCollectionProps extends React.PropsWithChildren {}
export interface CollectionItemProps extends React.PropsWithChildren {}
export interface CollectionSectionProps extends React.PropsWithChildren {}
export interface CollectionEmptyProps extends React.PropsWithChildren {}

export interface CollectionLoadMoreProps extends React.PropsWithChildren {
  readonly inProcess: boolean;
  readonly onLoad: () => unknown | Promise<unknown>;
}

export type ViewportPrimitiveKind =
  | 'collection'
  | 'collection-empty'
  | 'collection-item'
  | 'collection-load-more'
  | 'collection-section'
  | 'collection-sticky-item'
  | 'fixed-slot'
  | 'floating-slot'
  | 'refreshable'
  | 'slot'
  | 'sticky-slot';

const VIEWPORT_PRIMITIVE = Symbol('sellgar.viewport.primitive');

type PrimitiveComponent<Props> = React.FC<Props> & {
  readonly [VIEWPORT_PRIMITIVE]: ViewportPrimitiveKind;
};

const primitive = <Props extends React.PropsWithChildren>(
  kind: ViewportPrimitiveKind,
  displayName: string,
): PrimitiveComponent<Props> => {
  const Component: React.FC<Props> = (props) => <>{props.children}</>;

  Component.displayName = displayName;

  return Object.assign(Component, { [VIEWPORT_PRIMITIVE]: kind });
};

const marker = <Props extends object>(kind: ViewportPrimitiveKind, displayName: string): PrimitiveComponent<Props> => {
  const Component: React.FC<Props> = () => null;

  Component.displayName = displayName;

  return Object.assign(Component, { [VIEWPORT_PRIMITIVE]: kind });
};

export interface ViewportSlotComponent extends PrimitiveComponent<ViewportSlotProps> {
  Fixed: PrimitiveComponent<ViewportSlotProps>;
  Floating: PrimitiveComponent<ViewportFloatingSlotProps>;
  Sticky: PrimitiveComponent<ViewportSlotProps>;
}

const Slot = primitive<ViewportSlotProps>('slot', 'Viewport.Slot') as ViewportSlotComponent;
Slot.Fixed = primitive<ViewportSlotProps>('fixed-slot', 'Viewport.Slot.Fixed');
Slot.Floating = primitive<ViewportFloatingSlotProps>('floating-slot', 'Viewport.Slot.Floating');
Slot.Sticky = primitive<ViewportSlotProps>('sticky-slot', 'Viewport.Slot.Sticky');

export interface CollectionItemComponent extends PrimitiveComponent<CollectionItemProps> {
  Sticky: PrimitiveComponent<CollectionItemProps>;
}

export interface ViewportCollectionComponent extends PrimitiveComponent<ViewportCollectionProps> {
  Empty: PrimitiveComponent<CollectionEmptyProps>;
  Item: CollectionItemComponent;
  LoadMore: PrimitiveComponent<CollectionLoadMoreProps>;
  Section: PrimitiveComponent<CollectionSectionProps>;
}

const Item = primitive<CollectionItemProps>('collection-item', 'Collection.Item') as CollectionItemComponent;
Item.Sticky = primitive<CollectionItemProps>('collection-sticky-item', 'Collection.Item.Sticky');

export const Collection = primitive<ViewportCollectionProps>(
  'collection',
  'Viewport.Collection',
) as ViewportCollectionComponent;
Collection.Empty = primitive<CollectionEmptyProps>('collection-empty', 'Collection.Empty');
Collection.Item = Item;
Collection.LoadMore = primitive<CollectionLoadMoreProps>('collection-load-more', 'Collection.LoadMore');
Collection.Section = primitive<CollectionSectionProps>('collection-section', 'Collection.Section');

export const Refreshable = marker<ViewportRefreshableProps>('refreshable', 'Viewport.Refreshable');
export const ViewportSlot = Slot;

export const getViewportPrimitiveKind = (node: React.ReactNode): ViewportPrimitiveKind | null => {
  if (!React.isValidElement(node) || typeof node.type === 'string') return null;

  return (node.type as Partial<PrimitiveComponent<never>>)[VIEWPORT_PRIMITIVE] ?? null;
};
