import React from 'react';
import { useFetcher } from 'react-router';

import type { DependencyToken } from '../../../di/token/dependency-token';
import { useRuntimeScope } from '../../../runtime/react';
import type { RuntimeScopeInterface } from '../../../runtime/scope/contract';
import type { FrameRuntime } from '../../../frame/runtime/frame-runtime';
import type { WidgetRuntime } from '../../../widget/runtime/widget-runtime';
import {
  CONTROLLER_ACTION_ERROR_FIELD,
  CONTROLLER_ACTION_SUBMIT_ID_FIELD,
  createControllerActionBody,
  type ControllerActionErrorEnvelope,
  type ControllerActionResultEnvelope,
} from '../../action/controller-action-request';
import type { ControllerActionPayload, ControllerActionResult } from '../../contract/controller';
import { createControllerActionKey } from '../../data/controller-loader-data';
import { useControllerRuntime } from '../controller-runtime-context';

export type ControllerSubmit<TPayload, TResult> = ((payload: TPayload) => Promise<TResult | undefined>) & {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
};

export const useSubmit = <TController>(
  controller: DependencyToken<TController>,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const controllerRuntime = useControllerRuntime();
  const moduleSubmit = useModuleSubmit(controller, controllerRuntime.kind === 'module');
  const runtimeSubmit = useRuntimeSubmit(
    controller,
    controllerRuntime.kind === 'frame' || controllerRuntime.kind === 'widget' ? controllerRuntime.runtime : null,
  );

  return controllerRuntime.kind === 'module' ? moduleSubmit : runtimeSubmit;
};

const useModuleSubmit = <TController>(
  controller: DependencyToken<TController>,
  enabled: boolean,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const fetcher = useFetcher();
  const scope = useRuntimeScope();
  const store = React.useMemo(() => {
    return getControllerSubmitStore(scope, controller);
  }, [controller, scope]);
  const ownerRef = React.useRef<symbol | null>(null);

  if (ownerRef.current === null) {
    ownerRef.current = Symbol('controller-submit');
  }

  const owner = ownerRef.current;
  const controllerActionKey = React.useMemo(() => {
    return createControllerActionKey(controller);
  }, [controller]);
  const state = React.useSyncExternalStore(
    React.useCallback((onStoreChange) => store.subscribe(onStoreChange), [store]),
    React.useCallback(() => store.getState<ControllerActionResult<TController>>(), [store]),
    React.useCallback(() => store.getState<ControllerActionResult<TController>>(), [store]),
  );

  React.useEffect(() => {
    const pendingSubmitId = store.getPendingSubmitId(owner);

    if (!pendingSubmitId || fetcher.state !== 'idle') {
      return;
    }

    const result = fetcher.data as ControllerActionErrorEnvelope | ControllerActionResultEnvelope | undefined;

    if (result && typeof result === 'object' && result[CONTROLLER_ACTION_SUBMIT_ID_FIELD] === pendingSubmitId) {
      if (CONTROLLER_ACTION_ERROR_FIELD in result) {
        store.completeWithError(owner, pendingSubmitId, result[CONTROLLER_ACTION_ERROR_FIELD]);
        return;
      }

      const resultData = result.data as ControllerActionResult<TController>;

      store.complete(owner, pendingSubmitId, resultData);
      return;
    }

    store.fail(owner, new Error('Не удалось отправить действие контроллера.'));
  }, [fetcher.data, fetcher.state, owner, store]);

  React.useEffect(() => {
    return () => {
      store.cancel(owner);
    };
  }, [owner, store]);

  const submit = React.useCallback(
    (payload: ControllerActionPayload<TController>) => {
      if (!enabled) {
        return Promise.reject(new Error('Действие контроллера недоступно в текущем runtime entity.'));
      }

      if (store.hasPending()) {
        return Promise.reject(new Error('Действие контроллера уже выполняется.'));
      }

      if (controllerActionKey === undefined) {
        return Promise.reject(new Error('Действие контроллера не зарегистрировано в активном модуле.'));
      }

      const submitId = store.createSubmitId();
      const body = createControllerActionBody(controllerActionKey, submitId, payload);

      return new Promise<ControllerActionResult<TController> | undefined>((resolve, reject) => {
        const started = store.start({
          owner,
          reject,
          resolve: resolve as (value: unknown) => void,
          submitId,
        });

        if (!started) {
          reject(new Error('Действие контроллера уже выполняется.'));
          return;
        }

        try {
          fetcher.submit(body, {
            encType: 'application/json',
            method: 'post',
          });
        } catch (error) {
          if (!store.fail(owner, error)) {
            reject(error);
          }
        }
      });
    },
    [controllerActionKey, enabled, fetcher, owner, store],
  );

  return React.useMemo(
    () =>
      Object.assign(submit, {
        data: state.data,
        error: state.error,
        inProcess: state.inProcess,
      }) as ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>>,
    [state, submit],
  );
};

type RuntimeSubmitRuntime = FrameRuntime<object> | WidgetRuntime<object>;

const useRuntimeSubmit = <TController>(
  controller: DependencyToken<TController>,
  runtime: RuntimeSubmitRuntime | null,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const state = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        return runtime?.subscribe(onStoreChange) ?? (() => {});
      },
      [runtime],
    ),
    React.useCallback(
      () => runtime?.getActionState<ControllerActionResult<TController>>(controller) ?? DEFAULT_CONTROLLER_SUBMIT_STATE,
      [controller, runtime],
    ),
    React.useCallback(
      () => runtime?.getActionState<ControllerActionResult<TController>>(controller) ?? DEFAULT_CONTROLLER_SUBMIT_STATE,
      [controller, runtime],
    ),
  );

  const submit = React.useCallback(
    async (payload: ControllerActionPayload<TController>) => {
      if (runtime === null) {
        throw new Error('Действие контроллера недоступно в текущем runtime entity.');
      }

      return (await runtime.action(controller, payload)) as ControllerActionResult<TController>;
    },
    [controller, runtime],
  );

  return React.useMemo(
    () =>
      Object.assign(submit, {
        data: state.data,
        error: state.error,
        inProcess: state.inProcess,
      }) as ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>>,
    [state, submit],
  );
};

interface ControllerSubmitState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

interface ControllerSubmitPending {
  readonly owner: symbol;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: unknown) => void;
  readonly submitId: string;
}

type ControllerSubmitListener = () => void;

class ControllerSubmitStore {
  private readonly listeners = new Set<ControllerSubmitListener>();

  private counter = 0;
  private pending: ControllerSubmitPending | null = null;
  private state: ControllerSubmitState = DEFAULT_CONTROLLER_SUBMIT_STATE;

  cancel(owner: symbol): void {
    const pending = this.pending;

    if (!pending || pending.owner !== owner) {
      return;
    }

    this.pending = null;
    this.setState(DEFAULT_CONTROLLER_SUBMIT_STATE);
    pending.resolve(undefined);
  }

  complete<TResult>(owner: symbol, submitId: string, data: TResult): boolean {
    const pending = this.pending;

    if (!pending || pending.owner !== owner || pending.submitId !== submitId) {
      return false;
    }

    this.pending = null;
    this.setState({
      data,
      error: undefined,
      inProcess: false,
    });
    pending.resolve(data);

    return true;
  }

  completeWithError(owner: symbol, submitId: string, error: unknown): boolean {
    const pending = this.pending;

    if (!pending || pending.owner !== owner || pending.submitId !== submitId) {
      return false;
    }

    this.pending = null;
    this.setState({
      data: undefined,
      error,
      inProcess: false,
    });
    pending.reject(error);

    return true;
  }

  createSubmitId(): string {
    return `${Date.now()}-${++this.counter}`;
  }

  fail(owner: symbol, error: unknown): boolean {
    const pending = this.pending;

    if (!pending || pending.owner !== owner) {
      return false;
    }

    this.pending = null;
    this.setState({
      data: undefined,
      error,
      inProcess: false,
    });
    pending.reject(error);

    return true;
  }

  getPendingSubmitId(owner: symbol): string | null {
    const pending = this.pending;

    if (!pending || pending.owner !== owner) {
      return null;
    }

    return pending.submitId;
  }

  getState<TResult = unknown>(): ControllerSubmitState<TResult> {
    return this.state as ControllerSubmitState<TResult>;
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  start(pending: ControllerSubmitPending): boolean {
    if (this.pending) {
      return false;
    }

    this.pending = pending;
    this.setState({
      data: undefined,
      error: undefined,
      inProcess: true,
    });

    return true;
  }

  subscribe(listener: ControllerSubmitListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: ControllerSubmitState): void {
    this.state = state;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

const DEFAULT_CONTROLLER_SUBMIT_STATE: ControllerSubmitState = {
  data: undefined,
  error: undefined,
  inProcess: false,
};

const controllerSubmitStores = new WeakMap<
  RuntimeScopeInterface,
  Map<DependencyToken<unknown>, ControllerSubmitStore>
>();

const getControllerSubmitStore = (
  scope: RuntimeScopeInterface,
  controller: DependencyToken<unknown>,
): ControllerSubmitStore => {
  let scopeStores = controllerSubmitStores.get(scope);

  if (!scopeStores) {
    scopeStores = new Map();
    controllerSubmitStores.set(scope, scopeStores);
  }

  let store = scopeStores.get(controller);

  if (!store) {
    store = new ControllerSubmitStore();
    scopeStores.set(controller, store);
  }

  return store;
};
