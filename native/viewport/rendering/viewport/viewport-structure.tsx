import React from 'react';
import { View, type ViewStyle } from 'react-native';

import {
  getViewportPrimitiveKind,
  type CollectionLoadMoreProps,
  type ViewportFloatingHorizontal,
  type ViewportFloatingSlotProps,
  type ViewportFloatingVertical,
  type ViewportSlotProps,
} from './viewport-primitives.tsx';

export interface ViewportFlowEntry {
  readonly key: string;
  readonly node: React.ReactNode;
  readonly sticky: boolean;
}

export interface ViewportFloatingEntry {
  readonly horizontal: ViewportFloatingHorizontal;
  readonly key: string;
  readonly node: React.ReactNode;
  readonly vertical: ViewportFloatingVertical;
}

export interface ViewportLoadMore {
  readonly inProcess: boolean;
  readonly key: string;
  readonly node: React.ReactNode;
  readonly onLoad: () => unknown | Promise<unknown>;
}

export interface ViewportStructure {
  readonly collection: boolean;
  readonly floating: readonly ViewportFloatingEntry[];
  readonly flow: readonly ViewportFlowEntry[];
  readonly refreshable: boolean;
  readonly lowerFixed: readonly React.ReactNode[];
  readonly loadMore: ViewportLoadMore | null;
  readonly upperFixed: readonly React.ReactNode[];
}

export const resolveViewportStructure = (children: React.ReactNode): ViewportStructure => {
  const nodes = React.Children.toArray(children);
  const firstFlowIndex = nodes.findIndex(isFlowNode);
  let collection = false;
  let loadMore: ViewportLoadMore | null = null;
  let refreshable = false;
  const floating: ViewportFloatingEntry[] = [];
  const flow: ViewportFlowEntry[] = [];
  const lowerFixed: React.ReactNode[] = [];
  const upperFixed: React.ReactNode[] = [];

  nodes.forEach((node, index) => {
    const kind = getViewportPrimitiveKind(node);
    const key = resolveNodeKey(node, 'viewport', index);

    if (kind === 'refreshable') {
      refreshable = true;
      return;
    }

    if (kind === 'floating-slot' && React.isValidElement<ViewportFloatingSlotProps>(node)) {
      floating.push({
        horizontal: node.props.horizontal ?? 'start',
        key,
        node: node.props.children,
        vertical: node.props.vertical ?? 'top',
      });
      return;
    }

    if (kind === 'fixed-slot' && React.isValidElement<ViewportSlotProps>(node)) {
      const fixed = renderSlot(node.props, key);

      if (firstFlowIndex < 0 || index < firstFlowIndex) upperFixed.push(fixed);
      else lowerFixed.push(fixed);
      return;
    }

    if (kind === 'collection' && React.isValidElement<React.PropsWithChildren>(node)) {
      collection = true;
      const result = resolveCollection(node.props.children, key);
      loadMore ??= result.loadMore;
      flow.push(...result.entries);
      return;
    }

    flow.push(resolveFlowEntry(node, kind === 'sticky-slot', key));
  });

  return { collection, floating, flow, loadMore, lowerFixed, refreshable, upperFixed };
};

interface ResolvedCollection {
  readonly entries: readonly ViewportFlowEntry[];
  readonly loadMore: ViewportLoadMore | null;
}

type CollectionDescriptor =
  | { readonly entry: ViewportFlowEntry; readonly kind: 'entry' }
  | { readonly entry: ViewportFlowEntry; readonly kind: 'empty' };

const resolveCollection = (children: React.ReactNode, prefix: string): ResolvedCollection => {
  const descriptors: CollectionDescriptor[] = [];
  let itemCount = 0;
  let loadMore: ViewportLoadMore | null = null;

  const visit = (nodes: React.ReactNode, parentKey: string): void => {
    React.Children.toArray(nodes).forEach((node, index) => {
      const kind = getViewportPrimitiveKind(node);
      const key = resolveNodeKey(node, parentKey, index);

      if (kind === 'collection-section' && React.isValidElement<React.PropsWithChildren>(node)) {
        visit(node.props.children, key);
        return;
      }

      if (kind === 'collection-empty' && React.isValidElement<React.PropsWithChildren>(node)) {
        descriptors.push({
          entry: { key, node: node.props.children, sticky: false },
          kind: 'empty',
        });
        return;
      }

      if (kind === 'collection-load-more' && React.isValidElement<CollectionLoadMoreProps>(node)) {
        const candidate: ViewportLoadMore = {
          inProcess: node.props.inProcess,
          key,
          node: node.props.children,
          onLoad: node.props.onLoad,
        };

        loadMore ??= candidate;
        return;
      }

      const item = kind === 'collection-item' || kind === 'collection-sticky-item';
      descriptors.push({
        entry: resolveFlowEntry(node, kind === 'collection-sticky-item', key),
        kind: 'entry',
      });
      if (item || kind === null) itemCount += 1;
    });
  };

  visit(children, prefix);

  return {
    entries: descriptors.flatMap((descriptor) => {
      if (descriptor.kind === 'empty') return itemCount === 0 ? [descriptor.entry] : [];

      return [descriptor.entry];
    }),
    loadMore,
  };
};

const isFlowNode = (node: React.ReactNode): boolean => {
  const kind = getViewportPrimitiveKind(node);

  return kind !== 'fixed-slot' && kind !== 'floating-slot' && kind !== 'refreshable';
};

const resolveFlowEntry = (node: React.ReactNode, sticky: boolean, key: string): ViewportFlowEntry => {
  if (!React.isValidElement<ViewportSlotProps>(node)) return { key, node, sticky };

  const kind = getViewportPrimitiveKind(node);

  if (kind === 'slot' || kind === 'sticky-slot') {
    return { key, node: renderSlot(node.props, key), sticky };
  }

  if (kind === 'collection-item' || kind === 'collection-sticky-item') {
    return { key, node: <View>{node.props.children}</View>, sticky };
  }

  return { key, node, sticky };
};

const renderSlot = (props: ViewportSlotProps, key: string): React.ReactNode => (
  <View key={key} style={resolveFlexStyle(props)}>
    {props.children}
  </View>
);

const resolveFlexStyle = (props: ViewportSlotProps): ViewStyle => ({
  flexGrow: resolveFlexWeight(props.grow),
  flexShrink: resolveFlexWeight(props.shrink),
});

const resolveFlexWeight = (value: ViewportSlotProps['grow'] | ViewportSlotProps['shrink']): number => {
  if (value === true) return 1;
  if (value === false || value === undefined) return 0;

  return value;
};

const resolveNodeKey = (node: React.ReactNode, namespace: string, index: number): string => {
  if (!React.isValidElement(node) || node.key === null) return `${namespace}:${index}`;

  return `${namespace}:${String(node.key)}`;
};
