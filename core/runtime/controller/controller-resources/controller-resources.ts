import type { DependencyToken } from '../../../di/token/dependency-token';

export interface ControllerOwnedResource {
  revoke(): void;
  dispose?(): void | Promise<void>;
}

export interface ControllerResourceLifetime {
  readonly closed: boolean;
  own(resource: ControllerOwnedResource): void;
}

export interface ControllerResourceContext {
  readonly controllerConstructor: Function;
  readonly owner: ControllerResourceLifetime;
}

class OwnedControllerResources implements ControllerResourceLifetime {
  private readonly resources = new Set<ControllerOwnedResource>();
  private readonly errors: unknown[] = [];
  private disposePromise: Promise<void> | undefined;
  private released = false;
  private owned = false;

  get closed(): boolean {
    return this.released;
  }

  get hasResources(): boolean {
    return this.owned;
  }

  own(resource: ControllerOwnedResource): void {
    if (this.released) throw new Error('Ресурсы контроллера уже освобождаются.');
    this.owned = true;
    this.resources.add(resource);
  }

  beginRelease(): void {
    if (this.released) return;
    this.released = true;
    for (const resource of this.resources) {
      try {
        resource.revoke();
      } catch (error) {
        this.errors.push(error);
      }
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.beginRelease();
    this.disposePromise = this.finishDispose();
    return this.disposePromise;
  }

  private async finishDispose(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.resources].reverse().map((resource) => Promise.resolve().then(() => resource.dispose?.())),
    );
    this.resources.clear();
    for (const result of results) {
      if (result.status === 'rejected') this.errors.push(result.reason);
    }
    if (this.errors.length) throw new AggregateError(this.errors, 'Ошибки освобождения ресурсов контроллера.');
  }
}

interface ControllerOwnership {
  readonly group: ControllerResourceGroup;
  readonly lifetime: OwnedControllerResources;
}

// This tracks instance ownership only; it never addresses application resources by key.
const controllerOwners = new WeakMap<object, ControllerOwnership>();

export class ControllerResourceGroup {
  private readonly owners = new Set<OwnedControllerResources>();
  private frame: ControllerResourceContext | undefined;
  private released = false;
  private disposePromise: Promise<void> | undefined;

  capture(): ControllerResourceContext {
    if (!this.frame || this.released) {
      throw new Error('Ресурс контроллера можно создавать только при разрешении runtime-контроллера.');
    }
    return this.frame;
  }

  resolve<TController extends object>(
    token: DependencyToken<unknown>,
    controllerConstructor: Function,
    create: () => TController,
  ): TController {
    if (this.released) throw new Error('Группа ресурсов контроллеров уже освобождается.');
    if (this.frame) throw new Error('Вложенное разрешение runtime-контроллера не поддерживается.');
    const owner = new OwnedControllerResources();
    this.owners.add(owner);
    this.frame = { controllerConstructor, owner };
    try {
      const controller = create();
      const previous = controllerOwners.get(controller);
      if (previous) {
        if (previous.group !== this || previous.lifetime.closed) {
          throw new Error(`Экземпляр контроллера ${String(token)} уже принадлежит другому runtime lifecycle.`);
        }
        owner.beginRelease();
        return controller;
      }
      if (owner.hasResources) controllerOwners.set(controller, { group: this, lifetime: owner });
      return controller;
    } catch (error) {
      owner.beginRelease();
      throw error;
    } finally {
      this.frame = undefined;
    }
  }

  beginRelease(): void {
    if (this.released) return;
    this.released = true;
    for (const owner of this.owners) owner.beginRelease();
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.beginRelease();
    this.disposePromise = this.finishDispose();
    return this.disposePromise;
  }

  private async finishDispose(): Promise<void> {
    const results = await Promise.allSettled([...this.owners].map((owner) => owner.dispose()));
    this.owners.clear();
    const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
    if (errors.length) throw new AggregateError(errors, 'Ошибки освобождения группы ресурсов контроллеров.');
  }
}
