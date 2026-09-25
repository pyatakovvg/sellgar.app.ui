import React from 'react';
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
