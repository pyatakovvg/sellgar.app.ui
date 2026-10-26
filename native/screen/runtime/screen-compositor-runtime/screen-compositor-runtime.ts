export type ScreenLayerKind = 'application' | 'frame' | 'modal';

interface ScreenLayerEntry {
  readonly depth: number;
  readonly identity: symbol;
  readonly kind: ScreenLayerKind;
  readonly order: number;
  readonly parent: symbol | null;
}

export interface ScreenLayerSnapshot {
  readonly active: boolean;
  readonly canReceiveTouches: boolean;
}

type ScreenCompositorListener = () => void;

/** Owns physical presentation-layer ordering without turning the React tree into state storage. */
export class ScreenCompositorRuntime {
  private active: symbol | null = null;
  private touchPath: ReadonlySet<symbol> = new Set();
  private readonly entries = new Map<symbol, ScreenLayerEntry>();
  private readonly listeners = new Set<ScreenCompositorListener>();
  private sequence = 0;

  isActive = (identity: symbol): boolean => this.active === null || this.active === identity;

  getLayerSnapshot = (identity: symbol): ScreenLayerSnapshot => {
    if (this.isActive(identity)) return ACTIVE_LAYER;

    // A native ancestor must pass touches through even when its own screen is inactive.
    return this.touchPath.has(identity) ? ANCESTOR_LAYER : INACTIVE_LAYER;
  };

  register(identity: symbol, kind: ScreenLayerKind, depth: number, parent: symbol | null = null): () => void {
    this.entries.set(identity, Object.freeze({ depth, identity, kind, order: ++this.sequence, parent }));
    this.publishActive();

    return () => {
      if (!this.entries.delete(identity)) return;
      this.publishActive();
    };
  }

  subscribe = (listener: ScreenCompositorListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publishActive(): void {
    const active = resolveActiveLayer(this.entries.values())?.identity ?? null;
    const touchPath = resolveTouchPath(active, this.entries);

    // Parent layout effects can extend this path after the active child registers.
    if (this.active === active && sameTouchPath(this.touchPath, touchPath)) return;

    this.active = active;
    this.touchPath = touchPath;
    for (const listener of this.listeners) listener();
  }
}

const ACTIVE_LAYER: ScreenLayerSnapshot = Object.freeze({ active: true, canReceiveTouches: true });
const ANCESTOR_LAYER: ScreenLayerSnapshot = Object.freeze({ active: false, canReceiveTouches: true });
const INACTIVE_LAYER: ScreenLayerSnapshot = Object.freeze({ active: false, canReceiveTouches: false });

const resolveTouchPath = (
  active: symbol | null,
  entries: ReadonlyMap<symbol, ScreenLayerEntry>,
): ReadonlySet<symbol> => {
  const path = new Set<symbol>();
  let current = active;

  while (current !== null && !path.has(current)) {
    path.add(current);
    current = entries.get(current)?.parent ?? null;
  }

  return path;
};

const sameTouchPath = (left: ReadonlySet<symbol>, right: ReadonlySet<symbol>): boolean =>
  left.size === right.size && [...left].every((identity) => right.has(identity));

const resolveActiveLayer = (entries: Iterable<ScreenLayerEntry>): ScreenLayerEntry | null => {
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
