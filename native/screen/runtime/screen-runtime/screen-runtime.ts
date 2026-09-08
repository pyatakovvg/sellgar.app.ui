import type React from 'react';

import type { ScreenPresentation } from '../../declaration/screen-presentation';
import {
  completeScreenTransition,
  createScreenMachine,
  presentScreen,
  type ScreenMachineState,
} from '../screen-machine';

export interface ScreenSceneSnapshot {
  readonly content: React.ReactNode;
}

export type ScreenRuntimeListener = () => void;

export class ScreenSceneRuntime {
  private descriptor: ScreenPresentation;
  private readonly listeners = new Set<ScreenRuntimeListener>();
  private snapshot: ScreenSceneSnapshot;

  constructor(presentation: ScreenPresentation) {
    this.descriptor = createDescriptor(presentation);
    this.snapshot = Object.freeze({ content: presentation.content });
  }

  get key(): string {
    return this.descriptor.key;
  }

  getDescriptor(): ScreenPresentation {
    return this.descriptor;
  }

  getSnapshot = (): ScreenSceneSnapshot => this.snapshot;

  subscribe = (listener: ScreenRuntimeListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(presentation: ScreenPresentation, entering: boolean): boolean {
    if (presentation.key !== this.key) {
      throw new Error('ScreenSceneRuntime нельзя обновить presentation с другой identity.');
    }

    if (entering) {
      this.descriptor = createDescriptor(presentation);
    }

    if (this.snapshot.content === presentation.content) return false;

    this.snapshot = Object.freeze({ content: presentation.content });
    for (const listener of this.listeners) listener();
    return true;
  }
}

export interface ScreenRuntimeSnapshot {
  readonly machine: ScreenMachineState;
  readonly scenes: readonly ScreenSceneRuntime[];
}

export class ScreenRuntime {
  private readonly listeners = new Set<ScreenRuntimeListener>();
  private readonly scenes = new Map<string, ScreenSceneRuntime>();
  private snapshot: ScreenRuntimeSnapshot = createRuntimeSnapshot(createScreenMachine(), []);

  getSnapshot = (): ScreenRuntimeSnapshot => this.snapshot;

  subscribe = (listener: ScreenRuntimeListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  project(
    presentation: ScreenPresentation | null,
    retainedPresentations: readonly ScreenPresentation[] = EMPTY_PRESENTATIONS,
  ): boolean {
    if (presentation === null) {
      if (this.snapshot.machine.phase === 'empty') return false;

      this.publish(createScreenMachine());
      return true;
    }

    const currentTargetKey = resolveCurrentTargetKey(this.snapshot.machine);
    const entering = currentTargetKey !== presentation.key;
    const targetResult = this.resolveScene(presentation, entering);
    const target = targetResult.scene.getDescriptor();
    let contentChanged = targetResult.changed;
    const retained = retainedPresentations.map((candidate) => {
      const result = this.resolveScene(candidate, false);

      contentChanged ||= result.changed;
      return result.scene.getDescriptor();
    });

    if (hasProjection(this.snapshot.machine, target.key, retained)) return contentChanged;

    this.publish(presentScreen(this.snapshot.machine, target, retained));
    return true;
  }

  completeTransition(transitionId: number): void {
    const machine = completeScreenTransition(this.snapshot.machine, transitionId);

    if (machine !== this.snapshot.machine) this.publish(machine);
  }

  getCurrentKey(): string | null {
    return resolveCurrentTargetKey(this.snapshot.machine);
  }

  private resolveScene(
    presentation: ScreenPresentation,
    entering: boolean,
  ): { readonly changed: boolean; readonly scene: ScreenSceneRuntime } {
    const current = this.scenes.get(presentation.key);

    if (current) {
      return { changed: current.update(presentation, entering), scene: current };
    }

    const scene = new ScreenSceneRuntime(presentation);

    this.scenes.set(scene.key, scene);
    return { changed: true, scene };
  }

  private publish(machine: ScreenMachineState): void {
    if (machine === this.snapshot.machine) return;

    const activeKeys = new Set(machine.presentations.map((presentation) => presentation.key));

    for (const key of this.scenes.keys()) {
      if (!activeKeys.has(key)) this.scenes.delete(key);
    }

    const scenes = Object.freeze(
      machine.presentations.map((presentation) => {
        const scene = this.scenes.get(presentation.key);

        if (!scene) throw new Error(`Screen scene ${presentation.key} отсутствует в runtime registry.`);
        return scene;
      }),
    );

    this.snapshot = createRuntimeSnapshot(machine, scenes);
    for (const listener of this.listeners) listener();
  }
}

const hasProjection = (
  machine: ScreenMachineState,
  targetKey: string,
  retained: readonly ScreenPresentation[],
): boolean => {
  if (resolveCurrentTargetKey(machine) !== targetKey) return false;

  const retainedKeys = new Set(retained.map((presentation) => presentation.key));

  if (retainedKeys.size !== machine.retainedKeys.length) return false;
  return machine.retainedKeys.every((key) => retainedKeys.has(key));
};

const resolveCurrentTargetKey = (machine: ScreenMachineState): string | null => {
  return machine.phase === 'transitioning' ? machine.incomingKey : machine.currentKey;
};

const createDescriptor = (presentation: ScreenPresentation): ScreenPresentation => {
  return Object.freeze({
    content: null,
    key: presentation.key,
    transition: presentation.transition,
  });
};

const createRuntimeSnapshot = (
  machine: ScreenMachineState,
  scenes: readonly ScreenSceneRuntime[],
): ScreenRuntimeSnapshot => Object.freeze({ machine, scenes });

const EMPTY_PRESENTATIONS: readonly ScreenPresentation[] = Object.freeze([]);
