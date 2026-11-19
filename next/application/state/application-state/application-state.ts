import type { DependencyConstructor } from '../../../../core/di/binding/binding-builder';

export type ApplicationSnapshot = Readonly<Record<string, unknown>>;

/** Only public, serializable presentation state may cross the RSC boundary. */
export abstract class ApplicationStateInterface<TSnapshot = unknown> {
  abstract getSnapshot(): TSnapshot;
  abstract subscribe(listener: () => void): () => void;
  abstract hydrate(snapshot: TSnapshot): void;
  abstract serialize(): unknown;
}

export interface ApplicationStateToken<TSnapshot = unknown> extends DependencyConstructor<
  ApplicationStateInterface<TSnapshot>
> {
  readonly key: string;
  deserialize(snapshot: unknown): TSnapshot;
}
