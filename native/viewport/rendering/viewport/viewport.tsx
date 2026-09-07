import React from 'react';
import {
  Animated,
  RefreshControl,
  StyleSheet,
  View,
  VirtualizedList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type ScrollViewProps,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { KeyboardScrollView, type KeyboardScrollViewRef } from '../../../keyboard/rendering/keyboard-scroll-view';
import { useKeyboardRuntime } from '../../../keyboard/runtime/keyboard-runtime-context';
import { useRevalidate } from '../../../revalidate/hook/use-revalidate';
import { ShellScrollView } from '../../../router/rendering/shell-scroll-view';
import { useOptionalShellRuntime } from '../../../router/runtime/shell-runtime-context';
import { useScreenActive } from '../../../screen/runtime/screen-activity-context';
import { ViewportContext, type ViewportController } from '../../runtime/viewport-context';
import {
  Collection,
  Refreshable,
  ViewportSlot,
  type CollectionEmptyProps,
  type CollectionItemProps,
  type CollectionLoadMoreProps,
  type CollectionSectionProps,
  type ViewportCollectionProps,
  type ViewportCollectionComponent,
  type ViewportFloatingSlotProps,
  type ViewportRefreshableProps,
  type ViewportSlotComponent,
  type ViewportSlotProps,
} from './viewport-primitives.tsx';
import {
  resolveViewportStructure,
  type ViewportFloatingEntry,
  type ViewportFlowEntry,
  type ViewportStructure,
} from './viewport-structure.tsx';

export interface ViewportProps extends React.PropsWithChildren {}

export interface ViewportComponent extends React.FC<ViewportProps> {
  readonly Collection: ViewportCollectionComponent;
  readonly Refreshable: React.FC<ViewportRefreshableProps>;
  readonly Slot: ViewportSlotComponent;
}

interface ViewportScrollHandle {
  scrollToOffset(options: { readonly animated?: boolean; readonly offset: number }): void;
}

interface ViewportContentProps {
  readonly onMomentumScrollEnd?: NonNullable<ScrollViewProps['onMomentumScrollEnd']>;
  readonly onScrollBeginDrag?: NonNullable<ScrollViewProps['onScrollBeginDrag']>;
  readonly onScrollEndDrag?: NonNullable<ScrollViewProps['onScrollEndDrag']>;
  readonly refreshControl?: React.ReactElement<RefreshControlProps>;
  readonly structure: ViewportStructure;
}

const ViewportImplementation: React.FC<ViewportProps> = (props) => {
  const structure = resolveViewportStructure(props.children);

  if (structure.refreshable) {
    return <RefreshableViewport structure={structure} />;
  }

  return <ViewportContent structure={structure} />;
};

const RefreshableViewport: React.FC<{ readonly structure: ViewportStructure }> = (props) => {
  const keyboard = useKeyboardRuntime();
  const revalidate = useRevalidate();
  const keyboardDragActive = React.useRef(false);
  const [refreshAtTop, setRefreshAtTop] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const updateRefreshAtTop = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setRefreshAtTop(event.nativeEvent.contentOffset.y <= REFRESH_START_TOLERANCE);
  }, []);
  const handleScrollBeginDrag = React.useCallback<NonNullable<ScrollViewProps['onScrollBeginDrag']>>(
    (event) => {
      const startedAtTop = event.nativeEvent.contentOffset.y <= REFRESH_START_TOLERANCE;

      keyboardDragActive.current = keyboard.visible;
      setRefreshAtTop(startedAtTop);
    },
    [keyboard.visible],
  );
  const handleScrollEnd = React.useCallback<NonNullable<ScrollViewProps['onScrollEndDrag']>>(
    (event) => {
      updateRefreshAtTop(event);
      keyboardDragActive.current = false;
    },
    [updateRefreshAtTop],
  );
  const handleRefresh = React.useCallback(async () => {
    if (refreshing || keyboard.visible || keyboardDragActive.current) {
      if (keyboard.visible || keyboardDragActive.current) keyboard.dismiss();
      return;
    }

    setRefreshing(true);

    try {
      await revalidate();
    } finally {
      setRefreshing(false);
    }
  }, [keyboard, refreshing, revalidate]);
  const refreshEnabled = refreshAtTop && !keyboard.visible;

  return (
    <ViewportContent
      onMomentumScrollEnd={handleScrollEnd}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEnd}
      refreshControl={
        <RefreshControl enabled={refreshEnabled} onRefresh={() => void handleRefresh()} refreshing={refreshing} />
      }
      structure={props.structure}
    />
  );
};

const ViewportContent: React.FC<ViewportContentProps> = (props) => {
  const shell = useOptionalShellRuntime();
  const screenActive = useScreenActive();
  const scrollRef = React.useRef<KeyboardScrollViewRef | null>(null);
  const collectionRef = React.useRef<ViewportScrollHandle | null>(null);
  const [lowerFixedHeight, setLowerFixedHeight] = React.useState(0);
  const loadMore = useLoadMoreObserver(props.structure);
  const scrollToStart = React.useCallback<ViewportController['scrollToStart']>(
    (options = {}) => {
      const animated = options.animated ?? true;

      if (props.structure.collection) {
        collectionRef.current?.scrollToOffset({ animated, offset: 0 });
        return;
      }

      scrollRef.current?.scrollTo({ animated, y: 0 });
    },
    [props.structure.collection],
  );
  const controller = React.useMemo<ViewportController>(() => ({ scrollToStart }), [scrollToStart]);
  const scrollStyle = shell ? styles.shellScroll : styles.scroll;
  const handleLowerFixedLayout = React.useCallback((event: LayoutChangeEvent) => {
    setLowerFixedHeight(event.nativeEvent.layout.height);
  }, []);
  const keyboardBottomOffset = DEFAULT_KEYBOARD_BOTTOM_OFFSET + (shell ? 0 : lowerFixedHeight);
  const renderScrollComponent = React.useCallback(
    (scrollProps: ScrollViewProps) =>
      shell ? (
        <ShellScrollView {...scrollProps} bottomOffset={keyboardBottomOffset} enabled={false} />
      ) : (
        <KeyboardScrollView {...scrollProps} bottomOffset={keyboardBottomOffset} enabled={screenActive} />
      ),
    [keyboardBottomOffset, screenActive, shell],
  );
  const stickyHeaderIndices = React.useMemo(
    () => props.structure.flow.flatMap((entry, index) => (entry.sticky ? [index] : [])),
    [props.structure.flow],
  );
  const handleScrollBeginDrag = React.useCallback<NonNullable<ScrollViewProps['onScrollBeginDrag']>>(
    (event) => {
      props.onScrollBeginDrag?.(event);
      loadMore.onScrollBeginDrag();
    },
    [loadMore.onScrollBeginDrag, props.onScrollBeginDrag],
  );
  const handleMomentumScrollEnd = React.useCallback<NonNullable<ScrollViewProps['onMomentumScrollEnd']>>(
    (event) => {
      props.onMomentumScrollEnd?.(event);
    },
    [props.onMomentumScrollEnd],
  );
  const handleScrollEndDrag = React.useCallback<NonNullable<ScrollViewProps['onScrollEndDrag']>>(
    (event) => {
      props.onScrollEndDrag?.(event);
    },
    [props.onScrollEndDrag],
  );

  return (
    <ViewportContext.Provider value={controller}>
      <View style={shell ? styles.shellRoot : styles.root}>
        {props.structure.upperFixed}
        {props.structure.collection ? (
          <VirtualizedList
            contentContainerStyle={styles.content}
            data={props.structure.flow}
            getItem={getFlowItem}
            getItemCount={getFlowItemCount}
            keyExtractor={getFlowItemKey}
            onEndReached={loadMore.onEndReached}
            onEndReachedThreshold={LOAD_MORE_THRESHOLD}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            ref={(value) => {
              collectionRef.current = value;
            }}
            refreshControl={props.refreshControl}
            renderItem={renderFlowItem}
            renderScrollComponent={renderScrollComponent}
            scrollEventThrottle={16}
            stickyHeaderIndices={stickyHeaderIndices}
            style={scrollStyle}
          />
        ) : shell ? (
          <ShellScrollView
            bottomOffset={keyboardBottomOffset}
            contentContainerStyle={styles.content}
            ref={scrollRef}
            enabled={false}
            refreshControl={props.refreshControl}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            stickyHeaderIndices={stickyHeaderIndices}
            style={scrollStyle}
          >
            {props.structure.flow.map(renderFlowEntry)}
          </ShellScrollView>
        ) : (
          <KeyboardScrollView
            bottomOffset={keyboardBottomOffset}
            contentContainerStyle={styles.content}
            ref={scrollRef}
            enabled={screenActive}
            refreshControl={props.refreshControl}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            stickyHeaderIndices={stickyHeaderIndices}
            style={scrollStyle}
          >
            {props.structure.flow.map(renderFlowEntry)}
          </KeyboardScrollView>
        )}
        {props.structure.collection ? (
          <CollectionLoadMoreAccessory bottom={lowerFixedHeight} loadMore={props.structure.loadMore} />
        ) : null}
        {props.structure.lowerFixed.length > 0 ? (
          <KeyboardStickyView enabled={screenActive && !shell} onLayout={handleLowerFixedLayout}>
            {props.structure.lowerFixed}
          </KeyboardStickyView>
        ) : null}
        {props.structure.floating.map((entry) => (
          <ViewportFloating entry={entry} key={entry.key} keyboardAware={screenActive && !shell} />
        ))}
      </View>
    </ViewportContext.Provider>
  );
};

const ViewportFloating: React.FC<{
  readonly entry: ViewportFloatingEntry;
  readonly keyboardAware: boolean;
}> = (props) => {
  const style = [
    StyleSheet.absoluteFill,
    styles.floating,
    FLOATING_VERTICAL[props.entry.vertical],
    FLOATING_HORIZONTAL[props.entry.horizontal],
  ];

  if (props.entry.vertical === 'bottom') {
    return (
      <KeyboardStickyView enabled={props.keyboardAware} pointerEvents="box-none" style={style}>
        {props.entry.node}
      </KeyboardStickyView>
    );
  }

  return (
    <View pointerEvents="box-none" style={style}>
      {props.entry.node}
    </View>
  );
};

const LOAD_MORE_THRESHOLD = 0.1;
const LOAD_MORE_TRANSITION_DURATION = 180;
const REFRESH_START_TOLERANCE = 0.5;
const DEFAULT_KEYBOARD_BOTTOM_OFFSET = 40;

const CollectionLoadMoreAccessory: React.FC<{
  readonly bottom: number;
  readonly loadMore: ViewportStructure['loadMore'];
}> = (props) => {
  const inProcess = props.loadMore?.inProcess ?? false;
  const [mounted, setMounted] = React.useState(inProcess);
  const [height, setHeight] = React.useState(0);
  const progress = React.useRef(new Animated.Value(0)).current;
  const animation = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    animation.current?.stop();

    if (inProcess) {
      setMounted(true);

      if (height > 0) {
        animation.current = Animated.timing(progress, {
          duration: LOAD_MORE_TRANSITION_DURATION,
          toValue: 1,
          useNativeDriver: true,
        });
        animation.current.start();
      }

      return () => animation.current?.stop();
    }

    if (!mounted) return;

    if (height <= 0) {
      setMounted(false);
      return;
    }

    animation.current = Animated.timing(progress, {
      duration: LOAD_MORE_TRANSITION_DURATION,
      toValue: 0,
      useNativeDriver: true,
    });
    animation.current.start(({ finished }) => {
      if (finished) setMounted(false);
    });

    return () => animation.current?.stop();
  }, [height, inProcess, mounted, progress]);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
  }, []);

  if (!inProcess && !mounted) return null;

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents="none"
      style={[
        styles.loadMore,
        {
          bottom: props.bottom,
          opacity: height > 0 ? 1 : 0,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [height, 0],
              }),
            },
          ],
        },
      ]}
    >
      {props.loadMore?.node}
    </Animated.View>
  );
};

const useLoadMoreObserver = (structure: ViewportStructure) => {
  const interacted = React.useRef(false);
  const loading = React.useRef(false);
  const onScrollBeginDrag = React.useCallback(() => {
    interacted.current = true;
  }, []);
  const onEndReached = React.useCallback(async () => {
    const loadMore = structure.loadMore;

    if (!loadMore || !interacted.current || loading.current || loadMore.inProcess) return;

    interacted.current = false;
    loading.current = true;

    try {
      await loadMore.onLoad();
    } finally {
      loading.current = false;
    }
  }, [structure.loadMore]);

  return { onEndReached, onScrollBeginDrag };
};

const getFlowItem = (data: ArrayLike<ViewportFlowEntry> | null | undefined, index: number): ViewportFlowEntry => {
  if (!data) throw new Error('Viewport Collection data is not available.');

  return data[index];
};

const getFlowItemCount = (data: ArrayLike<ViewportFlowEntry> | null | undefined): number => data?.length ?? 0;
const getFlowItemKey = (item: ViewportFlowEntry): string => item.key;
const renderFlowItem = ({ item }: { readonly item: ViewportFlowEntry }): React.ReactElement => (
  <React.Fragment key={item.key}>{item.node}</React.Fragment>
);
const renderFlowEntry = (entry: ViewportFlowEntry): React.ReactNode => {
  if (React.isValidElement(entry.node)) return React.cloneElement(entry.node, { key: entry.key });

  return <React.Fragment key={entry.key}>{entry.node}</React.Fragment>;
};

const FLOATING_VERTICAL = StyleSheet.create({
  bottom: { justifyContent: 'flex-end' },
  center: { justifyContent: 'center' },
  top: { justifyContent: 'flex-start' },
});

const FLOATING_HORIZONTAL = StyleSheet.create({
  center: { alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  start: { alignItems: 'flex-start' },
});

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  floating: {
    zIndex: 1,
  },
  loadMore: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
  root: {
    flex: 1,
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
  shellRoot: {
    flexShrink: 1,
    position: 'relative',
  },
  shellScroll: {
    flexShrink: 1,
  },
});

export const Viewport = Object.assign(ViewportImplementation, {
  Collection,
  Refreshable,
  Slot: ViewportSlot,
}) as ViewportComponent;

Viewport.displayName = 'Viewport';

export {
  Collection,
  type CollectionEmptyProps,
  type CollectionItemProps,
  type CollectionLoadMoreProps,
  type CollectionSectionProps,
  type ViewportCollectionProps,
  type ViewportFloatingSlotProps,
  type ViewportRefreshableProps,
  type ViewportSlotProps,
};
