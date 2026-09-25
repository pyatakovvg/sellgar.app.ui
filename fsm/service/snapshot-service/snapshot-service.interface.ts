export abstract class SnapshotServiceInterface {
  abstract get<TValue extends object>(token: new () => TValue): TValue | null;

  abstract subscribe<TValue extends object>(
    token: new () => TValue,
    listener: (value: TValue | null) => void,
  ): () => void;
}
