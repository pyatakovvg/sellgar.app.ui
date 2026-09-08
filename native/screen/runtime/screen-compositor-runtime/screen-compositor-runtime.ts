export type ScreenLayerKind = 'application' | 'frame' | 'modal';

interface ScreenLayerEntry {
  readonly depth: number;
  readonly identity: symbol;
  readonly kind: ScreenLayerKind;
  readonly order: number;
}

type ScreenCompositorListener = () => void;

/** Owns physical presentation-layer ordering without turning the React tree into state storage. */
export class ScreenCompositorRuntime {
  private active: symbol | null = null;
  private readonly entries = new Map<symbol, ScreenLayerEntry>();
  private readonly listeners = new Set<ScreenCompositorListener>();
  private sequence = 0;

  isActive = (identity: symbol): boolean => this.active === null || this.active === identity;

  register(identity: symbol, kind: ScreenLayerKind, depth: number): () => void {
    this.entries.set(identity, Object.freeze({ depth, identity, kind, order: ++this.sequence }));
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

    if (this.active === active) return;

    this.active = active;
    for (const listener of this.listeners) listener();
  }
}

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
