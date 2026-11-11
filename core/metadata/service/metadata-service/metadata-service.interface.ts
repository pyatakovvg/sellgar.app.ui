import type { MetadataValues } from '../../declaration/metadata';

export type MetadataGetters = { readonly [K in keyof Required<MetadataValues>]: () => MetadataValues[K] };
export type MetadataSetters = { readonly [K in keyof Required<MetadataValues>]: (value: MetadataValues[K]) => void };
export type MetadataResets = { readonly [K in keyof Required<MetadataValues>]: () => void } & {
  readonly all: () => void;
};

/** One instance per Application/Module owner. It never writes to a browser document. */
export abstract class MetadataServiceInterface {
  abstract readonly get: MetadataGetters;
  abstract readonly set: MetadataSetters;
  abstract readonly reset: MetadataResets;
  abstract getSnapshot(): MetadataValues;
  abstract subscribe(listener: () => void): () => void;
}
