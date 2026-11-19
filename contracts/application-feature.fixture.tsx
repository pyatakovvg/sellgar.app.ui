import React from 'react';
import type { ApplicationConfiguratorInterface as ReactConfigurator } from '../react';
import type { ApplicationConfiguratorInterface as NativeConfigurator } from '../native';
import type { ApplicationConfiguratorInterface as FsmConfigurator } from '../fsm';
import {
  type ApplicationFeatureInterface,
  type ApplicationFeatureToken,
  Controller,
  UseBindings,
  type BindingRegistryInterface,
  type BindingModuleInterface,
} from '../core';
import { Feature, type ApplicationFeatureOptions, useLoaderData, useSubmit } from '../fsm';

@Controller()
class FeatureController {
  loader() {
    return 'loaded';
  }
  async action() {
    return 'saved';
  }
}

class FeatureBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(FeatureController).toSelf().inSingletonScope();
  }
}

const Wrapper: React.FC<React.PropsWithChildren> = (props) => {
  const data: string = useLoaderData(FeatureController);
  const submit = useSubmit(FeatureController);
  void [data, submit];
  return props.children;
};

@UseBindings(FeatureBindings)
@Feature({ wrapper: Wrapper, presentation: { layer: 'application', view: <span /> } })
class CustomFeature implements ApplicationFeatureInterface {}

const feature: ApplicationFeatureToken = CustomFeature;
const options: ApplicationFeatureOptions = {
  presentation: {
    // @ts-expect-error Frames are owned by the router, not application features.
    layer: 'frame',
    view: null,
  },
};
void [feature, options];

// Every renderer inherits application-owned providers from the core configurator.

declare const providers: Parameters<ReactConfigurator['providers']>[0];
declare const configurators: readonly [ReactConfigurator, NativeConfigurator, FsmConfigurator];
for (const configurator of configurators) configurator.providers(providers);
