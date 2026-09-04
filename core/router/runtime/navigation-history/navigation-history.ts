import type { NavigationState } from '../navigation-state';

export interface NavigationHistoryEntry<TActivation> {
  readonly activation: TActivation | null;
  readonly id: string;
  readonly navigation: NavigationState;
}

export interface NavigationHistoryMutation<TActivation> {
  readonly current: NavigationHistoryEntry<TActivation>;
  readonly released: readonly TActivation[];
}

/**
 * Platform-independent chronological navigation history.
 *
 * It owns only logical entries and activation references. A bridge may keep any
 * physical history it needs, but core remains authoritative for entry order and
 * activation lifetime.
 */
export class NavigationHistory<TActivation> {
  private entries: NavigationHistoryEntry<TActivation>[] = [];
  private sequence = 0;

  get current(): NavigationHistoryEntry<TActivation> | null {
    return this.entries.at(-1) ?? null;
  }

  get length(): number {
    return this.entries.length;
  }

  snapshot(): readonly NavigationHistoryEntry<TActivation>[] {
    return Object.freeze([...this.entries]);
  }

  find(id: string): NavigationHistoryEntry<TActivation> | null {
    return this.entries.find((entry) => entry.id === id) ?? null;
  }

  previous(): NavigationHistoryEntry<TActivation> | null {
    return this.entries.at(-2) ?? null;
  }

  push(
    navigation: NavigationState,
    activation: TActivation,
    id = this.nextId(),
  ): NavigationHistoryMutation<TActivation> {
    const current = createEntry(id, navigation, activation);

    this.entries.push(current);
    return createMutation(current, EMPTY_RELEASED);
  }

  replace(
    navigation: NavigationState,
    activation: TActivation,
    id = this.current?.id ?? this.nextId(),
  ): NavigationHistoryMutation<TActivation> {
    const removed = this.entries.pop();
    const current = createEntry(id, navigation, activation);

    this.entries.push(current);
    return createMutation(current, this.collectReleased(removed ? [removed] : []));
  }

  updateCurrent(navigation: NavigationState): NavigationHistoryMutation<TActivation> {
    const entry = this.current;

    if (!entry) throw new Error('Нельзя обновить пустую navigation history.');

    const current = createEntry(entry.id, navigation, entry.activation);

    this.entries[this.entries.length - 1] = current;
    return createMutation(current, EMPTY_RELEASED);
  }

  pop(targetId?: string): NavigationHistoryMutation<TActivation> | null {
    if (this.entries.length <= 1) return null;

    const index = targetId ? this.entries.findIndex((entry) => entry.id === targetId) : this.entries.length - 2;

    if (index < 0 || index >= this.entries.length - 1) return null;

    const removed = this.entries.splice(index + 1);
    const current = this.entries[index]!;

    return createMutation(current, this.collectReleased(removed));
  }

  reset(
    navigation: NavigationState,
    activation: TActivation,
    id = this.nextId(),
  ): NavigationHistoryMutation<TActivation> {
    const removed = this.entries;
    const current = createEntry(id, navigation, activation);

    this.entries = [current];
    return createMutation(current, this.collectReleased(removed));
  }

  restore(
    id: string,
    navigation: NavigationState,
    activation: TActivation,
  ): NavigationHistoryMutation<TActivation> | null {
    const index = this.entries.findIndex((entry) => entry.id === id);

    if (index < 0) return null;

    const removed = this.entries.splice(index);
    const current = createEntry(id, navigation, activation);

    this.entries.push(current);
    return createMutation(current, this.collectReleased(removed));
  }

  releaseInactiveActivations(): readonly TActivation[] {
    const current = this.current;

    if (!current) return EMPTY_RELEASED;

    const released = new Set<TActivation>();

    this.entries = this.entries.map((entry) => {
      if (entry === current || entry.activation === null) return entry;

      released.add(entry.activation);
      return createEntry<TActivation>(entry.id, entry.navigation, null);
    });

    if (current.activation !== null) released.delete(current.activation);

    return Object.freeze([...released]);
  }

  clear(): readonly TActivation[] {
    const removed = this.entries;

    this.entries = [];
    return this.collectReleased(removed);
  }

  private collectReleased(removed: readonly NavigationHistoryEntry<TActivation>[]): readonly TActivation[] {
    const retained = new Set(this.entries.flatMap((entry) => (entry.activation === null ? [] : [entry.activation])));

    return Object.freeze([
      ...new Set(
        removed.flatMap((entry) =>
          entry.activation !== null && !retained.has(entry.activation) ? [entry.activation] : [],
        ),
      ),
    ]);
  }

  private nextId(): string {
    return `navigation:${++this.sequence}`;
  }
}

const createEntry = <TActivation>(
  id: string,
  navigation: NavigationState,
  activation: TActivation | null,
): NavigationHistoryEntry<TActivation> => Object.freeze({ activation, id, navigation });

const createMutation = <TActivation>(
  current: NavigationHistoryEntry<TActivation>,
  released: readonly TActivation[],
): NavigationHistoryMutation<TActivation> => Object.freeze({ current, released });

const EMPTY_RELEASED = Object.freeze([]);
