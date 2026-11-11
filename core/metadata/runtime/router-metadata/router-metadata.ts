import type { MetadataValues } from '../../declaration/metadata';
import type { MetadataComposition } from '../../composition/metadata-composition';
import { MetadataServiceInterface } from '../../service/metadata-service';
import type { RouterRuntime } from '../../../router/runtime/router-runtime';

const EMPTY: MetadataValues = Object.freeze({});
type Source = { subscribe(listener: () => void): () => void };

/** Projects only committed routes. Pending and retained branches cannot publish document metadata. */
export class RouterMetadata<TPresentation = unknown> {
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions = new Map<Source, () => void>();
  private snapshot: MetadataComposition = Object.freeze({ application: EMPTY, page: EMPTY, frames: Object.freeze([]) });

  constructor(
    private readonly router: RouterRuntime<TPresentation>,
    private readonly application?: MetadataServiceInterface,
  ) {}

  getSnapshot = (): MetadataComposition => {
    this.refresh();
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.refresh();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        for (const unsubscribe of this.subscriptions.values()) unsubscribe();
        this.subscriptions.clear();
      }
    };
  };

  private readonly changed = (): void => {
    const previous = this.snapshot;
    this.refresh();
    if (previous !== this.snapshot) for (const listener of [...this.listeners]) listener();
  };

  private collectRouterLevel(
    router: RouterRuntime<TPresentation>,
    sources: Set<Source>,
  ): { values: MetadataValues; blocked: boolean } {
    let values: MetadataValues = EMPTY;
    let blocked = false;
    for (const route of router.getActiveLocalRouteRuntimes()) {
      sources.add(route);
      const phase = route.getSnapshot().phase;
      if (phase === 'failed' || phase === 'forbidden' || phase === 'not-found') {
        blocked = true;
        break;
      }
      const module = route.getModuleRuntimeOrNull()?.getActiveModuleOrNull();
      if (!module) continue;
      const metadata = module.scope.get(MetadataServiceInterface);
      sources.add(metadata);
      const local = metadata.getSnapshot();
      values = {
        title: local.title ?? values.title,
        description: local.description ?? values.description,
      };
    }

    return { values, blocked };
  }

  private refresh(): void {
    const sources = new Set<Source>();
    if (this.application) sources.add(this.application);
    const levels: MetadataValues[] = [];
    let router: RouterRuntime<TPresentation> | undefined = this.router;
    while (router) {
      sources.add(router);
      const phase = router.getSnapshot().phase;
      if (phase === 'failed' || phase === 'forbidden' || phase === 'not-found') break;
      const { values, blocked } = this.collectRouterLevel(router, sources);
      levels.push(values);
      router = blocked ? undefined : router.getActiveChildRouterRuntimeOrNull()?.runtime;
    }
    const application = this.application?.getSnapshot() ?? EMPTY;
    const page = levels[0] ?? EMPTY;
    const frames = levels.slice(1);
    if (
      !equalValues(application, this.snapshot.application) ||
      !equalValues(page, this.snapshot.page) ||
      frames.length !== this.snapshot.frames.length ||
      frames.some((frame, index) => !equalValues(frame, this.snapshot.frames[index]!))
    ) {
      this.snapshot = Object.freeze({
        application,
        page: Object.freeze(page),
        frames: Object.freeze(frames.map((frame) => Object.freeze(frame))),
      });
    }
    if (!this.listeners.size) return;
    for (const [source, unsubscribe] of this.subscriptions) {
      if (!sources.has(source)) {
        unsubscribe();
        this.subscriptions.delete(source);
      }
    }
    for (const source of sources) {
      if (!this.subscriptions.has(source)) this.subscriptions.set(source, source.subscribe(this.changed));
    }
  }
}

const equalValues = (left: MetadataValues, right: MetadataValues): boolean =>
  left.title === right.title && left.description === right.description;
