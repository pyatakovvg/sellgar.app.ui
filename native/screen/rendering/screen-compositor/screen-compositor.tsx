import React from 'react';

import { ScreenActivityProvider } from '../../runtime/screen-activity-context';

export type ScreenLayerKind = 'application' | 'frame' | 'modal';

interface ScreenLayerEntry {
  readonly depth: number;
  readonly identity: symbol;
  readonly kind: ScreenLayerKind;
  readonly order: number;
}

interface ScreenCompositorValue {
  readonly active: symbol | null;
  readonly entries: readonly ScreenLayerEntry[];
  readonly register: (identity: symbol, kind: ScreenLayerKind, depth: number) => () => void;
}

const ScreenCompositorContext = React.createContext<ScreenCompositorValue | null>(null);

export const ScreenCompositor: React.FC<React.PropsWithChildren> = (props) => {
  const sequence = React.useRef(0);
  const [entries, setEntries] = React.useState<readonly ScreenLayerEntry[]>(EMPTY_ENTRIES);
  const register = React.useCallback((identity: symbol, kind: ScreenLayerKind, depth: number) => {
    const entry = Object.freeze({ depth, identity, kind, order: ++sequence.current });

    setEntries((current) => Object.freeze([...current.filter((item) => item.identity !== identity), entry]));

    return () => {
      setEntries((current) => {
        const next = current.filter((item) => item.identity !== identity);

        return next.length === current.length ? current : Object.freeze(next);
      });
    };
  }, []);
  const active = resolveActiveLayer(entries)?.identity ?? null;
  const value = React.useMemo<ScreenCompositorValue>(
    () => Object.freeze({ active, entries, register }),
    [active, entries, register],
  );

  return <ScreenCompositorContext.Provider value={value}>{props.children}</ScreenCompositorContext.Provider>;
};

interface ScreenLayerHostProps extends React.PropsWithChildren {
  readonly depth?: number;
  readonly kind: ScreenLayerKind;
}

export const ScreenLayerHost: React.FC<ScreenLayerHostProps> = ({ children, depth = 0, kind }) => {
  const compositor = React.useContext(ScreenCompositorContext);
  const identity = React.useRef(Symbol(kind)).current;

  React.useLayoutEffect(() => {
    return compositor?.register(identity, kind, depth);
  }, [compositor?.register, depth, identity, kind]);

  const active = compositor === null || compositor.active === null || compositor.active === identity;

  return <ScreenActivityProvider active={active}>{children}</ScreenActivityProvider>;
};

const resolveActiveLayer = (entries: readonly ScreenLayerEntry[]): ScreenLayerEntry | null => {
  let active: ScreenLayerEntry | null = null;

  for (const entry of entries) {
    if (!active || compareLayers(entry, active) > 0) active = entry;
  }

  return active;
};

const compareLayers = (left: ScreenLayerEntry, right: ScreenLayerEntry): number => {
  const rank = SCREEN_LAYER_RANK[left.kind] - SCREEN_LAYER_RANK[right.kind];

  if (rank !== 0) return rank;
  if (left.depth !== right.depth) return left.depth - right.depth;

  return left.order - right.order;
};

const SCREEN_LAYER_RANK: Readonly<Record<ScreenLayerKind, number>> = Object.freeze({
  application: 0,
  frame: 1,
  modal: 2,
});

const EMPTY_ENTRIES: readonly ScreenLayerEntry[] = Object.freeze([]);
