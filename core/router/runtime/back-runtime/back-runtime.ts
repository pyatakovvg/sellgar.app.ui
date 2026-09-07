import type { BackCondition, BackHandler, BackInterception } from '../../service/back-service';
import type { BackBoundary } from './back-boundary.ts';
import { BackRuntimeInterface } from './back-runtime.interface.ts';

interface BackRegistration {
  readonly boundary: BackBoundary;
  readonly condition: BackCondition;
  readonly handler: BackHandler;
  readonly identity: number;
}

export class BackRuntime extends BackRuntimeInterface {
  private handling: Promise<boolean> | null = null;
  private readonly registrations = new Map<number, BackRegistration>();
  private revision = 0;

  handle(boundaries: readonly BackBoundary[]): Promise<boolean> {
    if (this.handling) {
      return Promise.resolve(true);
    }

    const registration = this.resolveRegistration(boundaries);

    if (!registration) {
      return Promise.resolve(false);
    }

    const handling = Promise.resolve()
      .then(() => registration.handler())
      .then(() => true)
      .finally(() => {
        if (this.handling === handling) {
          this.handling = null;
        }
      });

    this.handling = handling;
    return handling;
  }

  register(boundary: BackBoundary, condition: BackCondition, handler: BackHandler): BackInterception {
    const identity = ++this.revision;

    this.registrations.set(identity, { boundary, condition, handler, identity });

    return Object.freeze({
      dispose: () => {
        this.registrations.delete(identity);
      },
    });
  }

  private resolveRegistration(boundaries: readonly BackBoundary[]): BackRegistration | null {
    for (const boundary of boundaries) {
      const registrations = [...this.registrations.values()]
        .filter((registration) => registration.boundary === boundary)
        .sort((left, right) => right.identity - left.identity);

      for (const registration of registrations) {
        if (registration.condition()) {
          return registration;
        }
      }
    }

    return null;
  }
}
