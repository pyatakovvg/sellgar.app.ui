export type FsmSnapshotSourceListener<TSnapshot extends object> = (snapshot: TSnapshot) => void | Promise<void>;

export interface FsmSnapshotSourceSubscription {
  dispose(): Promise<void>;
}

export abstract class FsmSnapshotSourceInterface<TSnapshot extends object> {
  abstract subscribe(listener: FsmSnapshotSourceListener<TSnapshot>): FsmSnapshotSourceSubscription;
}
