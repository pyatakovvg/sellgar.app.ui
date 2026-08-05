export interface FrameNavigationEntry {
  readonly frameKey: string;
  readonly props: Record<string, unknown>;
}

export interface FrameNavigationState {
  readonly current: FrameNavigationEntry;
  readonly stack: readonly FrameNavigationEntry[];
}

const FRAME_NAVIGATION_STORAGE_KEY_PREFIX = 'tiyn:frame-navigation:v1';

export const createFrameNavigationEntry = (frameKey: string, props?: object): FrameNavigationEntry => {
  return {
    frameKey,
    props: props ? { ...(props as Record<string, unknown>) } : {},
  };
};

export const readFrameNavigationState = (scope?: string): FrameNavigationState | null => {
  const storage = getFrameNavigationStorage();

  if (!storage) {
    return null;
  }

  const rawValue = storage.getItem(createFrameNavigationStorageKey(scope));

  if (!rawValue) {
    return null;
  }

  try {
    return parseFrameNavigationState(JSON.parse(rawValue));
  } catch {
    return null;
  }
};

export const writeFrameNavigationState = (scope: string | undefined, navigation: FrameNavigationState): void => {
  const storage = getFrameNavigationStorage();

  if (!storage) {
    return;
  }

  storage.setItem(createFrameNavigationStorageKey(scope), JSON.stringify(navigation));
};

export const clearFrameNavigationState = (scope?: string): void => {
  const storage = getFrameNavigationStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(createFrameNavigationStorageKey(scope));
};

export const createFrameNavigationStorageKey = (scope?: string): string => {
  return `${FRAME_NAVIGATION_STORAGE_KEY_PREFIX}:${normalizeFrameNavigationScope(scope)}`;
};

const parseFrameNavigationState = (value: unknown): FrameNavigationState | null => {
  if (!isRecord(value)) {
    return null;
  }

  const current = parseFrameNavigationEntry(value.current);

  if (!current) {
    return null;
  }

  return {
    current,
    stack: Array.isArray(value.stack) ? value.stack.map(parseFrameNavigationEntry).filter(isFrameNavigationEntry) : [],
  };
};

const parseFrameNavigationEntry = (value: unknown): FrameNavigationEntry | null => {
  if (!isRecord(value) || typeof value.frameKey !== 'string' || !isRecord(value.props)) {
    return null;
  }

  return {
    frameKey: value.frameKey,
    props: { ...value.props },
  };
};

const isFrameNavigationEntry = (value: FrameNavigationEntry | null): value is FrameNavigationEntry => {
  return value !== null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const normalizeFrameNavigationScope = (scope: string | undefined): string => {
  if (!scope || scope === '/') {
    return '/';
  }

  return `/${scope}`.replace(/\/+/g, '/').replace(/\/$/, '');
};

const getFrameNavigationStorage = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};
