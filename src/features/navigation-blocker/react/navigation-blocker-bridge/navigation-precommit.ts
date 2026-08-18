import type {
  NavigationBlockerRuntimeInterface,
  NavigationBlockerTransition,
} from '../../runtime/navigation-blocker-runtime';

interface NavigationPrecommitOptions {
  readonly clearPrecommittedTraversal: () => void;
  readonly permitTraversal: (destination: URL) => void;
  readonly resolveTransition: (destination: URL) => NavigationBlockerTransition;
  readonly runtime: NavigationBlockerRuntimeInterface;
}

export const connectNavigationPrecommit = (options: NavigationPrecommitOptions): (() => void) => {
  const navigation = resolveNavigation();

  if (navigation === null) {
    return () => undefined;
  }

  const handleNavigate = (event: NavigateEvent): void => {
    options.clearPrecommittedTraversal();

    if (!canHandleBeforeCommit(event)) {
      return;
    }

    const destination = new URL(event.destination.url);

    if (!options.runtime.shouldBlock(options.resolveTransition(destination))) {
      options.permitTraversal(destination);
      return;
    }

    const decision = createNavigationDecision();
    const handleAbort = (): void => {
      decision.reject(event.signal.reason ?? createNavigationAbortError());
      options.runtime.complete();
    };

    event.signal.addEventListener('abort', handleAbort, { once: true });

    try {
      event.intercept({
        handler: () => {
          event.signal.removeEventListener('abort', handleAbort);
          options.runtime.complete();
        },
        precommitHandler: () => decision.promise,
      });
    } catch {
      event.signal.removeEventListener('abort', handleAbort);
      options.runtime.complete();
      return;
    }

    options.runtime.attach({
      proceed: () => {
        options.permitTraversal(destination);
        decision.resolve();
      },
      reset: () => {
        decision.reject(createNavigationAbortError());
      },
    });
  };

  navigation.addEventListener('navigate', handleNavigate);

  return () => {
    navigation.removeEventListener('navigate', handleNavigate);
  };
};

interface NavigationDecision {
  readonly promise: Promise<void>;
  readonly reject: (reason: unknown) => void;
  readonly resolve: () => void;
}

const createNavigationDecision = (): NavigationDecision => {
  let settled = false;
  let resolvePromise!: () => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: (reason) => {
      if (settled) {
        return;
      }

      settled = true;
      rejectPromise(reason);
    },
    resolve: () => {
      if (settled) {
        return;
      }

      settled = true;
      resolvePromise();
    },
  };
};

const canHandleBeforeCommit = (event: NavigateEvent): boolean => {
  return (
    event.navigationType === 'traverse' && event.canIntercept && event.cancelable && event.destination.sameDocument
  );
};

const resolveNavigation = (): Navigation | null => {
  if (
    typeof window === 'undefined' ||
    !('navigation' in window) ||
    typeof NavigationPrecommitController === 'undefined'
  ) {
    return null;
  }

  return window.navigation;
};

const createNavigationAbortError = (): DOMException => {
  return new DOMException('Navigation was cancelled.', 'AbortError');
};
