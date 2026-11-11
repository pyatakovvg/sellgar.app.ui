export interface MetadataValues {
  readonly title?: string;
  readonly description?: string;
}

const METADATA_KEY = Symbol('tiyn-app:metadata');
const EMPTY_METADATA: MetadataValues = Object.freeze({});

/** Declares local defaults; presentation and title composition belong to the host. */
export const Metadata =
  (values: MetadataValues): ClassDecorator =>
  (target) => {
    if (Reflect.hasOwnMetadata(METADATA_KEY, target)) {
      throw new Error('Декоратор @Metadata допускается только один раз на владельца.');
    }
    Reflect.defineMetadata(METADATA_KEY, Object.freeze({ ...values }), target);
  };

export const getMetadataDefaults = (target: object): MetadataValues =>
  (Reflect.getMetadata(METADATA_KEY, target) as MetadataValues | undefined) ?? EMPTY_METADATA;
