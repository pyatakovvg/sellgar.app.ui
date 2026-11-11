import {
  Inject,
  Metadata,
  MetadataServiceInterface,
  type MetadataValues,
  type MetadataCompositionOptions,
} from '../core';

@Metadata({ title: 'Личный кабинет', description: 'Приложение' })
class MetadataOwner {}

class MetadataConsumer {
  constructor(@Inject(MetadataServiceInterface) readonly metadata: MetadataServiceInterface) {}
  update(): MetadataValues {
    this.metadata.set.title('Заказы');
    this.metadata.set.description(undefined);
    const title: string | undefined = this.metadata.get.title();
    this.metadata.reset.title();
    this.metadata.reset.description();
    this.metadata.reset.all();
    // @ts-expect-error title accepts only text or undefined
    this.metadata.set.title(123);
    // @ts-expect-error unsupported metadata keys are not silently accepted
    this.metadata.set.unknown('value');
    return { title, description: this.metadata.get.description() };
  }
}
const options: MetadataCompositionOptions = {
  formatTitle: ({ application, page, frames }) =>
    [application.title, page.title, ...frames.map((frame) => frame.title)].filter(Boolean).join(' / '),
};
void [MetadataOwner, MetadataConsumer, options];
