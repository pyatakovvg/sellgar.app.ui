import type {
  ControllerArgs,
  RuntimeController,
  WithParams,
  WithPayload,
  WithProps,
} from '../../../controller/contract/controller';
import { createControllerLoaderData, type ControllerLoaderData } from '../../../controller/data/controller-loader-data';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { executeGuardedMethod } from '../../../guard/runtime/guard-method-executor';
import type { ModuleRuntimeDefinition } from '../../contract/module-runtime-definition';
import { captureRuntimeFailure } from '../../../runtime/failure/runtime-failure-signal';
import {
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeOwner,
} from '../../../runtime/failure/runtime-failure';
import { executeRuntimeParticipant } from '../../../runtime/operation/runtime-operation';
import { ProviderPipeline } from '../../../runtime/provider/provider-pipeline';
import { ModuleScope } from '../../../runtime/scope/kind/module-scope';

export type LoadedModuleControllerContext = ControllerArgs<WithParams<Record<string, unknown>, WithProps<object>>>;

export interface LoadedModuleRuntime<TPresentation = unknown> {
  readonly controllers: Map<DependencyToken<unknown>, RuntimeController>;
  readonly definition: ModuleRuntimeDefinition<TPresentation>;
  readonly failureReporter: RuntimeFailureReporterInterface;
  loaderData: ControllerLoaderData;
  readonly owner: RuntimeOwner;
  readonly providerPipeline: ProviderPipeline;
  readonly scope: ModuleScope;
}

export const createLoadedModuleRuntime = async <TPresentation>(
  scope: ModuleScope,
  definition: ModuleRuntimeDefinition<TPresentation>,
  owner: RuntimeOwner,
): Promise<LoadedModuleRuntime<TPresentation>> => {
  const controllers = new Map<DependencyToken<unknown>, RuntimeController>();
  const failureReporter = scope.get(RuntimeFailureReporterInterface);

  try {
    scope.activate(definition.token, { collectControllerBindings: true });

    for (const bindingOwner of definition.bindingOwners) {
      scope.activate(bindingOwner);
    }

    for (const controllerToken of scope.getControllerTokens()) {
      controllers.set(controllerToken, scope.get(controllerToken) as RuntimeController);
    }

    return {
      controllers,
      definition,
      failureReporter,
      loaderData: createControllerLoaderData([]),
      owner,
      providerPipeline: new ProviderPipeline(scope, definition.providers, owner),
      scope,
    };
  } catch (error) {
    await disposeControllers(controllers, failureReporter, owner);
    await disposeModuleScope(scope, failureReporter, owner);
    throw error;
  }
};

export interface LoadLoadedModuleRuntimeOptions {
  readonly abortMessage?: string;
  readonly controllerToken?: DependencyToken<unknown>;
  readonly setup?: boolean;
}

export const loadLoadedModuleRuntime = async (
  runtime: LoadedModuleRuntime,
  args: LoadedModuleControllerContext,
  options: LoadLoadedModuleRuntimeOptions = {},
): Promise<ControllerLoaderData> => {
  const abortMessage = options.abortMessage ?? 'Выполнение модуля было прервано.';
  const context = createProviderContext(runtime, args);

  if (options.setup === false) {
    const [loaderData] = await Promise.all([
      loadControllers(runtime, args, options.controllerToken),
      runtime.providerPipeline.revalidate(context),
    ]);

    throwIfAborted(args.signal, abortMessage);

    return loaderData;
  }

  await runtime.providerPipeline.initialize(context);
  throwIfAborted(args.signal, abortMessage);

  const [loaderData] = await Promise.all([
    loadControllers(runtime, args, options.controllerToken),
    runtime.providerPipeline.prepare(context),
  ]);

  throwIfAborted(args.signal, abortMessage);
  await runtime.providerPipeline.activate(context);
  throwIfAborted(args.signal, abortMessage);

  return loaderData;
};

export const executeLoadedModuleAction = async <TPayload>(
  runtime: LoadedModuleRuntime,
  controllerToken: DependencyToken<unknown>,
  payload: TPayload,
  args: LoadedModuleControllerContext,
): Promise<unknown> => {
  const controller = runtime.controllers.get(controllerToken);

  if (!controller?.action) {
    throw new Error('Действие контроллера модуля недоступно.');
  }

  const actionArgs: ControllerArgs<WithPayload<TPayload, WithParams<Record<string, unknown>, WithProps<object>>>> = {
    params: args.params,
    payload,
    props: args.props,
    signal: args.signal,
  };

  return await executeRuntimeParticipant(
    {
      operation: 'action',
      owner: runtime.owner,
      participant: { kind: 'controller', token: controllerToken },
    },
    () =>
      executeGuardedMethod({
        context: actionArgs,
        execute: () => controller.action?.(actionArgs),
        method: 'action',
        scope: runtime.scope,
        target: controller,
        token: controllerToken,
      }),
  );
};

export const disposeLoadedModuleRuntime = async (runtime: LoadedModuleRuntime): Promise<void> => {
  await disposeControllers(runtime.controllers, runtime.failureReporter, runtime.owner);
  await runtime.providerPipeline.dispose();
  await disposeModuleScope(runtime.scope, runtime.failureReporter, runtime.owner);
};

const loadControllers = async (
  runtime: LoadedModuleRuntime,
  args: LoadedModuleControllerContext,
  controllerToken?: DependencyToken<unknown>,
): Promise<ControllerLoaderData> => {
  const controllers = selectControllers(runtime.controllers, controllerToken);
  const entries = await Promise.all(
    controllers.map(async ([token, controller]) => {
      const value = controller.loader
        ? await executeRuntimeParticipant(
            {
              operation: 'loader',
              owner: runtime.owner,
              participant: { kind: 'controller', token },
            },
            () =>
              executeGuardedMethod({
                context: args,
                execute: () => controller.loader?.(args),
                method: 'loader',
                scope: runtime.scope,
                target: controller,
                token,
              }),
          )
        : undefined;

      return { controller: token, value };
    }),
  );

  return createControllerLoaderData(entries);
};

const selectControllers = (
  controllers: ReadonlyMap<DependencyToken<unknown>, RuntimeController>,
  controllerToken?: DependencyToken<unknown>,
): Array<[DependencyToken<unknown>, RuntimeController]> => {
  if (controllerToken === undefined) {
    return [...controllers];
  }

  const controller = controllers.get(controllerToken);

  if (controller === undefined) {
    throw new Error('Контроллер модуля недоступен.');
  }

  return [[controllerToken, controller]];
};

const createProviderContext = (runtime: LoadedModuleRuntime, args: LoadedModuleControllerContext) => {
  return {
    params: args.params,
    props: args.props,
    scope: runtime.scope,
    signal: args.signal,
  };
};

const throwIfAborted = (signal: AbortSignal, message: string): void => {
  if (signal.aborted) {
    throw new Error(message);
  }
};

const disposeControllers = async (
  controllers: ReadonlyMap<DependencyToken<unknown>, RuntimeController>,
  failureReporter: RuntimeFailureReporterInterface,
  owner: RuntimeOwner,
): Promise<void> => {
  const results = await Promise.allSettled(
    [...controllers.values()].reverse().map((controller) => Promise.resolve().then(() => controller.dispose?.())),
  );

  await Promise.allSettled(
    results.map((result) => {
      return result.status === 'rejected'
        ? reportCleanupFailure(failureReporter, owner, result.reason, 'controller.dispose')
        : Promise.resolve();
    }),
  );
};

const disposeModuleScope = async (
  scope: ModuleScope,
  failureReporter: RuntimeFailureReporterInterface,
  owner: RuntimeOwner,
): Promise<void> => {
  try {
    scope.dispose();
  } catch (error) {
    await reportCleanupFailure(failureReporter, owner, error, 'scope.dispose');
  }
};

const reportCleanupFailure = async (
  failureReporter: RuntimeFailureReporterInterface,
  owner: RuntimeOwner,
  error: unknown,
  operation: string,
): Promise<void> => {
  await reportRuntimeFailure(
    failureReporter,
    captureRuntimeFailure(error, {
      operation,
      owner,
      participant: { kind: 'runtime' },
    }),
    owner,
    'cleanup.contained',
    'disposing',
  );
};
