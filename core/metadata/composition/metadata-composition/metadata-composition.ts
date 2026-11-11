import type { MetadataValues } from '../../declaration/metadata';

export interface MetadataComposition {
  readonly application: MetadataValues;
  readonly page: MetadataValues;
  readonly frames: readonly MetadataValues[];
}

export interface MetadataCompositionOptions {
  readonly formatTitle?: (composition: MetadataComposition) => string | undefined;
}

export const formatMetadataTitle = ({ application, page, frames }: MetadataComposition): string | undefined => {
  const base = [application.title, page.title].filter(Boolean).join(': ');
  const frameTitles = frames.map((frame) => frame.title).filter(Boolean);
  const suffix = frameTitles.length ? `(${frameTitles.join(' — ')})` : '';
  return [base, suffix].filter(Boolean).join(' ') || undefined;
};

export const composeMetadata = (
  composition: MetadataComposition,
  options: MetadataCompositionOptions = {},
): MetadataValues => ({
  title: (options.formatTitle ?? formatMetadataTitle)(composition),
  description:
    [...composition.frames].reverse().find((frame) => frame.description !== undefined)?.description ??
    composition.page.description ??
    composition.application.description,
});
